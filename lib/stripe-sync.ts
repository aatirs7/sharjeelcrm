import { eq } from 'drizzle-orm'
import { db } from './db'
import { orders, customers, leads, coaches, products } from './db/schema'
import { computeOrderMoney, commissionForSale, discountedPrice } from './money'
import { syncOrderCommission } from './commissions'
import { recomputeCustomerRollups, recomputeCoachRollups } from './automations'

const BASE = 'https://api.stripe.com/v1'

function key(): string | null {
  const k = (process.env.STRIPE_SECRET_KEY || process.env.STRIPE_TOKEN || '').trim()
  return k.startsWith('sk_') || k.startsWith('rk_') ? k : null
}

interface Charge {
  id: string
  amount: number
  amount_refunded: number
  status: string
  paid: boolean
  refunded: boolean
  disputed?: boolean
  created: number
  billing_details?: { name: string | null; email: string | null }
}

async function allCharges(k: string): Promise<Charge[]> {
  const out: Charge[] = []
  let after: string | undefined
  for (let i = 0; i < 20; i++) {
    const q = new URLSearchParams({ limit: '100' })
    if (after) q.set('starting_after', after)
    const res = await fetch(`${BASE}/charges?${q}`, { headers: { Authorization: `Bearer ${k}` } })
    if (!res.ok) break
    const page = (await res.json()) as { data: Charge[]; has_more: boolean }
    out.push(...page.data)
    if (!page.has_more || page.data.length === 0) break
    after = page.data[page.data.length - 1].id
  }
  return out
}

/**
 * Import real Stripe charges into the CRM as customers + orders so the tables
 * reflect actual sales (not just the Stripe revenue figure). Idempotent: a
 * charge already imported (orders.transactionId === charge.id) is skipped, but
 * its refund/dispute state is refreshed. Attributes to a coach when the buyer's
 * email matches a ticket's email. Returns counts.
 */
export async function syncStripeOrders(): Promise<{
  created: number
  updated: number
  skipped: number
  error?: string
}> {
  const k = key()
  if (!k) return { created: 0, updated: 0, skipped: 0, error: 'Stripe not configured' }

  const charges = (await allCharges(k)).filter((c) => c.paid && (c.status === 'succeeded' || c.amount_refunded > 0))
  const [productRows, existingOrders, leadRows, coachRows] = await Promise.all([
    db.select().from(products),
    db.select({ id: orders.id, transactionId: orders.transactionId, paymentStatus: orders.paymentStatus }).from(orders),
    db.select().from(leads),
    db.select().from(coaches),
  ])
  const orderByTxn = new Map(existingOrders.filter((o) => o.transactionId).map((o) => [o.transactionId!, o]))
  const leadByEmail = new Map(
    leadRows.filter((l) => l.email).map((l) => [l.email!.toLowerCase(), l])
  )
  const coachById = new Map(coachRows.map((c) => [c.id, c]))

  // Buyers pay the discounted price, so match charges on that first, then the catalog price.
  const productForAmount = (amt: number) =>
    (productRows.find((p) => discountedPrice(p.priceCents) === amt) ?? productRows.find((p) => p.priceCents === amt))?.name ??
    'TikTok Shop Account'

  let created = 0
  let updated = 0
  let skipped = 0
  const touchedCustomers = new Set<string>()
  const touchedCoaches = new Set<string>()

  for (const c of charges) {
    const email = c.billing_details?.email?.toLowerCase() ?? null
    const name = c.billing_details?.name ?? null
    const payStatus = c.disputed ? 'chargeback' : c.amount_refunded > 0 ? 'refunded' : 'paid'

    const existing = orderByTxn.get(c.id)
    if (existing) {
      // Keep the refund/dispute state current, but don't recreate.
      if (existing.paymentStatus !== payStatus) {
        await db.update(orders).set({ paymentStatus: payStatus, status: payStatus }).where(eq(orders.id, existing.id))
        updated++
      } else skipped++
      continue
    }

    // Upsert the customer by email (falls back to name).
    let customer =
      (email ? await db.query.customers.findFirst({ where: eq(customers.email, email) }) : undefined) ??
      (name ? await db.query.customers.findFirst({ where: eq(customers.discordUsername, name) }) : undefined)
    if (!customer) {
      const handle = email || name || `stripe-${c.id.slice(-8)}`
      const [row] = await db
        .insert(customers)
        .values({ discordUsername: handle, email, displayName: name })
        .returning()
      customer = row
    } else if (email && !customer.email) {
      await db.update(customers).set({ email }).where(eq(customers.id, customer.id))
    }

    // Attribute to a coach if the buyer's email matches a ticket's email.
    const lead = email ? leadByEmail.get(email) : undefined
    const coachId = lead?.sourceCoachId ?? null
    const coach = coachId ? coachById.get(coachId) : null

    const priceCents = c.amount
    const commissionCents = commissionForSale(priceCents, coach ?? null)
    const money = computeOrderMoney({ priceCents, commissionCents })

    const [order] = await db
      .insert(orders)
      .values({
        leadId: lead?.id ?? null,
        customerId: customer.id,
        sourceCoachId: coachId,
        promoCodeUsed: coach?.promoCode ?? null,
        package: productForAmount(priceCents),
        priceCents,
        supplierPayoutCents: money.supplierPayoutCents,
        serviceFeeCents: money.serviceFeeCents,
        profitCents: money.profitCents,
        commissionCents: money.commissionCents,
        netProfitCents: money.netProfitCents,
        paymentMethod: 'card',
        paymentStatus: payStatus,
        transactionId: c.id,
        paidAt: new Date(c.created * 1000),
        status: payStatus === 'paid' ? 'paid' : payStatus,
      })
      .returning()
    created++
    touchedCustomers.add(customer.id)
    if (coachId) {
      await syncOrderCommission(order.id) // create the pending commission when attributed
      touchedCoaches.add(coachId)
    }
  }

  for (const id of touchedCustomers) await recomputeCustomerRollups(id)
  for (const id of touchedCoaches) await recomputeCoachRollups(id)
  return { created, updated, skipped }
}
