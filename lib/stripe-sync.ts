import { eq } from 'drizzle-orm'
import { db } from './db'
import { orders, customers, leads, coaches, products } from './db/schema'
import { computeOrderMoney, commissionForSale } from './money'
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
  payment_intent?: string | null
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
 * its refund/dispute state is refreshed and a missing coach is filled in.
 * Attributes to a coach via the charge's payment intent (stamped on the ticket
 * by the webhook), with the buyer's email as a fallback. Returns counts.
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
    db.select({
      id: orders.id,
      transactionId: orders.transactionId,
      paymentStatus: orders.paymentStatus,
      sourceCoachId: orders.sourceCoachId,
      priceCents: orders.priceCents,
    }).from(orders),
    db.select().from(leads),
    db.select().from(coaches),
  ])
  const orderByTxn = new Map(existingOrders.filter((o) => o.transactionId).map((o) => [o.transactionId!, o]))
  const leadByEmail = new Map(
    leadRows.filter((l) => l.email).map((l) => [l.email!.toLowerCase(), l])
  )
  // The webhook stamps the lead with the charge's payment intent (`paymentRef`).
  // That is the reliable link for a Discord sale, whose ticket has no email of
  // its own; matching on `billing_details.email` misses because Checkout charges
  // usually carry no billing email.
  const leadByPI = new Map(
    leadRows.filter((l) => l.paymentRef).map((l) => [l.paymentRef!, l])
  )
  const coachById = new Map(coachRows.map((c) => [c.id, c]))
  const leadForCharge = (c: Charge, email: string | null) =>
    (c.payment_intent ? leadByPI.get(c.payment_intent) : undefined) ??
    (email ? leadByEmail.get(email) : undefined)

  const productForAmount = (amt: number) => productRows.find((p) => p.priceCents === amt)?.name ?? 'TikTok Shop Account'

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
      // Self-heal attribution: an order imported before we matched on the
      // payment intent can sit with no coach even though its ticket used a
      // promo. Attach the coach and its commission retroactively.
      if (!existing.sourceCoachId) {
        const lead = leadForCharge(c, email)
        const coachId = lead?.sourceCoachId ?? null
        const coach = coachId ? coachById.get(coachId) : null
        if (coachId && coach) {
          const commissionCents = commissionForSale(existing.priceCents, coach)
          const money = computeOrderMoney({ priceCents: existing.priceCents, commissionCents })
          await db
            .update(orders)
            .set({
              leadId: lead!.id,
              sourceCoachId: coachId,
              promoCodeUsed: coach.promoCode ?? lead!.promoCodeUsed ?? null,
              commissionCents: money.commissionCents,
              netProfitCents: money.netProfitCents,
            })
            .where(eq(orders.id, existing.id))
          await syncOrderCommission(existing.id)
          touchedCoaches.add(coachId)
        }
      }
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

    // Attribute to a coach via the charge's payment intent (set on the ticket
    // by the webhook), falling back to the buyer's email.
    const lead = leadForCharge(c, email)
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
