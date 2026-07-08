/**
 * Seed script: realistic sample data so the dashboard and tables have something
 * to render before the app is live. Run with `npm run db:seed`.
 *
 * Idempotent: wipes all sample rows first (and any rep whose id starts with
 * `seed_`), then re-inserts. Real Clerk-synced reps are left untouched.
 *
 * Money and warranty dates are computed the same way the app computes them on
 * write (lib/money.ts), so seeded rows are internally consistent.
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
config({ path: '.env' })

import { like, eq } from 'drizzle-orm'
import { db } from './index'
import {
  reps,
  affiliates,
  customers,
  leads,
  orders,
  issues,
  tasks,
} from './schema'
import { computeOrderMoney } from '../money'

const DAY = 86_400_000
const now = Date.now()
const daysFromNow = (n: number) => new Date(now + n * DAY)

async function wipe() {
  // FK-safe order.
  await db.delete(tasks)
  await db.delete(issues)
  await db.delete(orders)
  await db.delete(leads)
  await db.delete(customers)
  await db.delete(affiliates)
  await db.delete(reps).where(like(reps.id, 'seed_%'))
}

async function main() {
  console.log('Wiping existing sample data…')
  await wipe()

  // --- reps -----------------------------------------------------------------
  const [admin, rep] = await db
    .insert(reps)
    .values([
      { id: 'seed_admin', displayName: 'Sharjeel (Admin)', email: 'admin@example.com', role: 'admin' },
      { id: 'seed_rep', displayName: 'Jordan (Rep)', email: 'rep@example.com', role: 'rep' },
    ])
    .returning()

  // --- affiliates -----------------------------------------------------------
  const [alpha, beta] = await db
    .insert(affiliates)
    .values([
      { name: 'Affiliate Alpha', discordUsername: 'alpha_promos', commissionRate: '0.10', commissionPaidCents: 0, notes: 'Runs a TikTok growth Discord.' },
      { name: 'Affiliate Beta', discordUsername: 'beta_deals', commissionRate: '0.15', commissionPaidCents: 5000, notes: 'Higher rate, negotiated.' },
    ])
    .returning()

  // --- order blueprints (customer-keyed) ------------------------------------
  // Each blueprint expands into a real order once its customer row exists.
  type Blueprint = {
    discordUsername: string
    displayName: string
    riskStatus?: 'good' | 'watch' | 'high_risk' | 'blocked'
    package: string
    priceCents: number
    affiliate?: { id: string; commissionRate: string } | null
    paymentStatus: 'paid' | 'refunded' | 'chargeback'
    status: 'paid' | 'awaiting_delivery' | 'delivered' | 'closed' | 'refunded' | 'chargeback'
    paymentMethod: 'paypal' | 'crypto' | 'zelle' | 'cashapp' | 'card' | 'other'
    paidDaysAgo: number
    // delivery timing (only for delivered/closed)
    deliveredDaysAgo?: number
    warrantyDays?: number
    buyerConfirmed?: boolean
    proof?: boolean
  }

  const blueprints: Blueprint[] = [
    // buyer_ace — repeat customer, 2 orders
    { discordUsername: 'buyer_ace', displayName: 'Ace', package: 'Starter Shop', priceCents: 25000, affiliate: alpha, paymentStatus: 'paid', status: 'delivered', paymentMethod: 'paypal', paidDaysAgo: 12, deliveredDaysAgo: 10, warrantyDays: 30, buyerConfirmed: true, proof: true }, // active warranty (ends +20d)
    { discordUsername: 'buyer_ace', displayName: 'Ace', package: 'Growth Shop', priceCents: 45000, affiliate: null, paymentStatus: 'paid', status: 'closed', paymentMethod: 'crypto', paidDaysAgo: 65, deliveredDaysAgo: 60, warrantyDays: 30, buyerConfirmed: true, proof: true }, // warranty long expired, closed
    // buyer_neo — expiring warranty
    { discordUsername: 'buyer_neo', displayName: 'Neo', package: 'Starter Shop', priceCents: 25000, affiliate: beta, paymentStatus: 'paid', status: 'delivered', paymentMethod: 'zelle', paidDaysAgo: 27, deliveredDaysAgo: 25, warrantyDays: 30, buyerConfirmed: true, proof: true }, // ends +5d (expiring)
    // buyer_trinity — awaiting delivery
    { discordUsername: 'buyer_trinity', displayName: 'Trinity', riskStatus: 'watch', package: 'Premium Shop', priceCents: 80000, affiliate: null, paymentStatus: 'paid', status: 'awaiting_delivery', paymentMethod: 'card', paidDaysAgo: 1 },
    // buyer_morpheus — just paid, not started
    { discordUsername: 'buyer_morpheus', displayName: 'Morpheus', package: 'Growth Shop', priceCents: 45000, affiliate: alpha, paymentStatus: 'paid', status: 'paid', paymentMethod: 'cashapp', paidDaysAgo: 0 },
    // buyer_switch — delivered but warranty expired (still status delivered)
    { discordUsername: 'buyer_switch', displayName: 'Switch', package: 'Starter Shop', priceCents: 25000, affiliate: null, paymentStatus: 'paid', status: 'delivered', paymentMethod: 'paypal', paidDaysAgo: 47, deliveredDaysAgo: 45, warrantyDays: 30, buyerConfirmed: false, proof: true }, // ended 15d ago
    // buyer_cypher — refunded
    { discordUsername: 'buyer_cypher', displayName: 'Cypher', riskStatus: 'high_risk', package: 'Premium Shop', priceCents: 80000, affiliate: null, paymentStatus: 'refunded', status: 'refunded', paymentMethod: 'paypal', paidDaysAgo: 8 },
    // buyer_dozer — chargeback
    { discordUsername: 'buyer_dozer', displayName: 'Dozer', riskStatus: 'blocked', package: 'Growth Shop', priceCents: 45000, affiliate: beta, paymentStatus: 'chargeback', status: 'chargeback', paymentMethod: 'card', paidDaysAgo: 20 },
  ]

  // --- customers (unique by discordUsername), rollups from their blueprints --
  const byCustomer = new Map<string, Blueprint[]>()
  for (const b of blueprints) {
    const list = byCustomer.get(b.discordUsername) ?? []
    list.push(b)
    byCustomer.set(b.discordUsername, list)
  }

  const customerIdByUsername = new Map<string, string>()
  for (const [username, bps] of byCustomer) {
    const paid = bps.filter((b) => b.paymentStatus === 'paid')
    const totalSpentCents = paid.reduce((s, b) => s + b.priceCents, 0)
    const lastPurchaseAt =
      paid.length > 0
        ? daysFromNow(-Math.min(...paid.map((b) => b.paidDaysAgo)))
        : null
    const [row] = await db
      .insert(customers)
      .values({
        discordUsername: username,
        displayName: bps[0].displayName,
        riskStatus: bps[0].riskStatus ?? 'good',
        totalOrders: bps.length,
        totalSpentCents,
        lastPurchaseAt,
        notes: username === 'buyer_ace' ? 'Repeat buyer, reliable.' : null,
      })
      .returning()
    customerIdByUsername.set(username, row.id)
  }

  // --- leads (10 across every status) ---------------------------------------
  const insertedLeads = await db
    .insert(leads)
    .values([
      { discordUsername: 'lead_ghost', source: 'discord', interest: 'Starter Shop', budgetCents: 20000, status: 'new_lead', assignedRepId: rep.id, lastContactAt: daysFromNow(-1) },
      { discordUsername: 'lead_raven', source: 'tiktok', interest: 'Growth Shop', budgetCents: 40000, status: 'new_lead', assignedRepId: rep.id },
      { discordUsername: 'lead_kilo', source: 'referral', interest: 'Premium Shop', budgetCents: 75000, status: 'qualified', assignedRepId: rep.id, lastContactAt: daysFromNow(-2) },
      { discordUsername: 'lead_juno', source: 'discord', interest: 'Starter Shop', budgetCents: 25000, status: 'qualified', assignedRepId: admin.id },
      { discordUsername: 'lead_vega', source: 'affiliate', interest: 'Growth Shop', budgetCents: 45000, status: 'payment_pending', assignedRepId: rep.id, nextFollowUpAt: daysFromNow(1) },
      { discordUsername: 'lead_orion', source: 'discord', interest: 'Premium Shop', budgetCents: 80000, status: 'payment_pending', assignedRepId: rep.id, nextFollowUpAt: daysFromNow(1) },
      { discordUsername: 'buyer_ace', source: 'discord', interest: 'Starter Shop', budgetCents: 25000, status: 'won', assignedRepId: rep.id, lastContactAt: daysFromNow(-12) },
      { discordUsername: 'buyer_neo', source: 'affiliate', interest: 'Starter Shop', budgetCents: 25000, status: 'won', assignedRepId: admin.id, lastContactAt: daysFromNow(-27) },
      { discordUsername: 'lead_atlas', source: 'repeat', interest: 'Growth Shop', budgetCents: 45000, status: 'lost', assignedRepId: rep.id, notes: 'Went with a competitor.' },
      { discordUsername: 'lead_nova', source: 'other', interest: 'Premium Shop', budgetCents: 90000, status: 'lost', assignedRepId: admin.id, notes: 'Budget fell through.' },
    ])
    .returning()

  const leadByUsername = new Map(insertedLeads.map((l) => [l.discordUsername, l]))

  // --- orders (expand blueprints) -------------------------------------------
  const affiliateTotals = new Map<string, { sales: number; revenue: number; commission: number }>()
  const insertedOrders = []

  for (const b of blueprints) {
    const money = computeOrderMoney({
      priceCents: b.priceCents,
      commissionRate: b.affiliate?.commissionRate ?? null,
    })
    const paidAt = daysFromNow(-b.paidDaysAgo)
    const delivered = b.deliveredDaysAgo != null
    const warrantyStart = delivered ? daysFromNow(-b.deliveredDaysAgo!) : null
    const warrantyEnd =
      warrantyStart != null ? new Date(warrantyStart.getTime() + (b.warrantyDays ?? 30) * DAY) : null

    const [order] = await db
      .insert(orders)
      .values({
        leadId: leadByUsername.get(b.discordUsername)?.id ?? null,
        customerId: customerIdByUsername.get(b.discordUsername)!,
        affiliateId: b.affiliate?.id ?? null,
        package: b.package,
        priceCents: b.priceCents,
        supplierPayoutCents: money.supplierPayoutCents,
        profitCents: money.profitCents,
        commissionCents: money.commissionCents,
        netProfitCents: money.netProfitCents,
        paymentMethod: b.paymentMethod,
        paymentStatus: b.paymentStatus,
        transactionId: `seed_txn_${Math.round(b.priceCents + b.paidDaysAgo)}`,
        paidAt: b.paymentStatus === 'paid' ? paidAt : paidAt,
        deliveryStatus: delivered ? 'delivered' : b.status === 'awaiting_delivery' ? 'in_progress' : 'not_started',
        deliveredAt: warrantyStart,
        deliveryProofUrl: b.proof ? 'https://example.com/proof/seed.png' : null,
        buyerConfirmed: b.buyerConfirmed ?? false,
        buyerConfirmedAt: b.buyerConfirmed ? warrantyStart : null,
        warrantyDays: b.warrantyDays ?? 30,
        warrantyStart,
        warrantyEnd,
        status: b.status,
      })
      .returning()
    insertedOrders.push(order)

    // Affiliate rollups count paid orders only.
    if (b.affiliate && b.paymentStatus === 'paid') {
      const t = affiliateTotals.get(b.affiliate.id) ?? { sales: 0, revenue: 0, commission: 0 }
      t.sales += 1
      t.revenue += b.priceCents
      t.commission += money.commissionCents
      affiliateTotals.set(b.affiliate.id, t)
    }
  }

  // --- affiliate rollups ----------------------------------------------------
  for (const aff of [alpha, beta]) {
    const t = affiliateTotals.get(aff.id) ?? { sales: 0, revenue: 0, commission: 0 }
    await db
      .update(affiliates)
      .set({
        closedSalesCount: t.sales,
        referralsCount: t.sales,
        revenueCents: t.revenue,
        commissionOwedCents: Math.max(0, t.commission - aff.commissionPaidCents),
      })
      .where(eq(affiliates.id, aff.id))
  }

  // --- issues (one open, one resolved) --------------------------------------
  const aceDelivered = insertedOrders[0] // buyer_ace active-warranty order
  const switchExpired = insertedOrders[5] // buyer_switch expired-warranty order
  await db.insert(issues).values([
    {
      orderId: aceDelivered.id,
      issueType: 'login_issue',
      warrantyValidAtOpen: true,
      replacementStatus: 'in_progress',
      resolutionNotes: 'Buyer locked out; resetting credentials with supplier.',
      openedAt: daysFromNow(-2),
    },
    {
      orderId: switchExpired.id,
      issueType: 'not_as_described',
      warrantyValidAtOpen: false,
      replacementStatus: 'resolved',
      resolutionNotes: 'Out of warranty but issued goodwill replacement.',
      proofUrl: 'https://example.com/proof/replacement.png',
      openedAt: daysFromNow(-20),
      resolvedAt: daysFromNow(-18),
    },
  ])

  // --- tasks (a mix: open, overdue, and one done) ---------------------------
  const vegaLead = leadByUsername.get('lead_vega')!
  const trinityOrder = insertedOrders[3] // awaiting delivery
  const neoOrder = insertedOrders[2] // expiring warranty
  await db.insert(tasks).values([
    { type: 'follow_up', status: 'open', title: 'Follow up on payment (lead_vega)', dueAt: daysFromNow(1), leadId: vegaLead.id, assignedRepId: rep.id },
    { type: 'follow_up', status: 'open', title: 'Overdue: chase lead_orion', dueAt: daysFromNow(-1), leadId: leadByUsername.get('lead_orion')!.id, assignedRepId: rep.id },
    { type: 'delivery', status: 'open', title: 'Deliver Premium Shop (Trinity)', dueAt: daysFromNow(1), orderId: trinityOrder.id, assignedRepId: rep.id },
    { type: 'warranty_expiry', status: 'open', title: 'Warranty expiring soon (Neo)', dueAt: neoOrder.warrantyEnd, orderId: neoOrder.id, assignedRepId: rep.id },
    { type: 'upload_proof', status: 'done', title: 'Upload delivery proof (Ace)', dueAt: daysFromNow(-9), orderId: insertedOrders[0].id, assignedRepId: rep.id, completedAt: daysFromNow(-9) },
  ])

  console.log(
    `Seeded: 2 reps, 2 affiliates, ${customerIdByUsername.size} customers, ` +
      `${insertedLeads.length} leads, ${insertedOrders.length} orders, 2 issues, 5 tasks.`
  )
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
