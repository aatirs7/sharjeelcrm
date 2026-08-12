/**
 * Seed script: realistic sample data so the dashboard and tables have something
 * to render. Run with `npm run db:seed`.
 *
 * DESTRUCTIVE: wipes every non-rep table before re-inserting. Intended for a
 * FRESH or dev database only. Do NOT run against production — the live DB keeps
 * its real Discord tickets and coaches (see HANDOFF.md / v2 migration notes).
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
  coaches,
  customers,
  leads,
  orders,
  commissions,
  payouts,
  coachContent,
  issues,
  tasks,
} from './schema'
import { computeOrderMoney, commissionForSale, type CoachTier } from '../money'

const DAY = 86_400_000
const now = Date.now()
const daysFromNow = (n: number) => new Date(now + n * DAY)

async function wipe() {
  // FK-safe order (children before parents).
  await db.delete(tasks)
  await db.delete(issues)
  await db.delete(commissions)
  await db.delete(orders)
  await db.delete(coachContent)
  await db.delete(payouts)
  await db.delete(leads)
  await db.delete(customers)
  await db.delete(coaches)
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

  // --- coaches --------------------------------------------------------------
  const [alpha, beta] = await db
    .insert(coaches)
    .values([
      {
        name: 'Ishhy Prints',
        coachCode: 'ishhy-printss',
        promoCode: 'ISHHY100',
        discordUsername: 'ishhy',
        commissionRate: '0.10',
        tier: 'silver',
        payoutMethod: 'paypal',
        commissionPaidCents: 0,
        notes: 'Runs a TikTok growth Discord.',
      },
      {
        name: 'Titan Deals',
        coachCode: 'titan-deals',
        promoCode: 'TITAN15',
        discordUsername: 'titan',
        commissionRate: '0.15',
        tier: 'gold',
        payoutMethod: 'zelle',
        commissionPaidCents: 5000,
        notes: 'Higher rate, negotiated.',
      },
    ])
    .returning()

  const coachRate = (c: typeof alpha) => ({ tier: c.tier as CoachTier, commissionRate: c.commissionRate })

  // --- order blueprints (customer-keyed) ------------------------------------
  type CommissionState = 'pending' | 'approved' | 'paid' | 'cancelled' | 'not_eligible'
  type Blueprint = {
    discordUsername: string
    displayName: string
    riskStatus?: 'good' | 'watch' | 'high_risk' | 'blocked'
    package: string
    priceCents: number
    coach?: typeof alpha | null
    paymentStatus: 'paid' | 'refunded' | 'chargeback'
    status: 'paid' | 'awaiting_delivery' | 'delivered' | 'closed' | 'refunded' | 'chargeback'
    paymentMethod: 'paypal' | 'crypto' | 'zelle' | 'cashapp' | 'card' | 'other'
    paidDaysAgo: number
    deliveredDaysAgo?: number
    warrantyDays?: number
    buyerConfirmed?: boolean
    proof?: boolean
    // Commission ledger state to seed for this order (only when it has a coach).
    commission?: CommissionState
    cancelReason?: 'refund' | 'chargeback'
  }

  const blueprints: Blueprint[] = [
    // buyer_ace — repeat customer, 2 orders. First earns an APPROVED commission.
    { discordUsername: 'buyer_ace', displayName: 'Ace', package: 'Starter Shop', priceCents: 25000, coach: alpha, paymentStatus: 'paid', status: 'delivered', paymentMethod: 'paypal', paidDaysAgo: 12, deliveredDaysAgo: 10, warrantyDays: 30, buyerConfirmed: true, proof: true, commission: 'approved' },
    { discordUsername: 'buyer_ace', displayName: 'Ace', package: 'Growth Shop', priceCents: 45000, coach: null, paymentStatus: 'paid', status: 'closed', paymentMethod: 'crypto', paidDaysAgo: 65, deliveredDaysAgo: 60, warrantyDays: 30, buyerConfirmed: true, proof: true },
    // buyer_neo — PAID commission (already in a payout batch).
    { discordUsername: 'buyer_neo', displayName: 'Neo', package: 'Starter Shop', priceCents: 25000, coach: beta, paymentStatus: 'paid', status: 'delivered', paymentMethod: 'zelle', paidDaysAgo: 27, deliveredDaysAgo: 25, warrantyDays: 30, buyerConfirmed: true, proof: true, commission: 'paid' },
    // buyer_trinity — awaiting delivery, no coach.
    { discordUsername: 'buyer_trinity', displayName: 'Trinity', riskStatus: 'watch', package: 'Premium Shop', priceCents: 80000, coach: null, paymentStatus: 'paid', status: 'awaiting_delivery', paymentMethod: 'card', paidDaysAgo: 1 },
    // buyer_morpheus — just paid, PENDING commission (inside the 7-day hold).
    { discordUsername: 'buyer_morpheus', displayName: 'Morpheus', package: 'Growth Shop', priceCents: 45000, coach: alpha, paymentStatus: 'paid', status: 'paid', paymentMethod: 'cashapp', paidDaysAgo: 2, commission: 'pending' },
    // buyer_switch — delivered, warranty expired, no coach.
    { discordUsername: 'buyer_switch', displayName: 'Switch', package: 'Starter Shop', priceCents: 25000, coach: null, paymentStatus: 'paid', status: 'delivered', paymentMethod: 'paypal', paidDaysAgo: 47, deliveredDaysAgo: 45, warrantyDays: 30, buyerConfirmed: false, proof: true },
    // buyer_cypher — refunded → CANCELLED commission (reason refund).
    { discordUsername: 'buyer_cypher', displayName: 'Cypher', riskStatus: 'high_risk', package: 'Premium Shop', priceCents: 80000, coach: alpha, paymentStatus: 'refunded', status: 'refunded', paymentMethod: 'paypal', paidDaysAgo: 8, commission: 'cancelled', cancelReason: 'refund' },
    // buyer_dozer — chargeback → CANCELLED commission (reason chargeback).
    { discordUsername: 'buyer_dozer', displayName: 'Dozer', riskStatus: 'blocked', package: 'Growth Shop', priceCents: 45000, coach: beta, paymentStatus: 'chargeback', status: 'chargeback', paymentMethod: 'card', paidDaysAgo: 20, commission: 'cancelled', cancelReason: 'chargeback' },
    // buyer_link — paid but flagged NOT_ELIGIBLE (e.g. self-referral under review).
    { discordUsername: 'buyer_link', displayName: 'Link', package: 'Starter Shop', priceCents: 25000, coach: beta, paymentStatus: 'paid', status: 'paid', paymentMethod: 'paypal', paidDaysAgo: 3, commission: 'not_eligible' },
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
      paid.length > 0 ? daysFromNow(-Math.min(...paid.map((b) => b.paidDaysAgo))) : null
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

  // --- leads (across every status) ------------------------------------------
  const insertedLeads = await db
    .insert(leads)
    .values([
      { discordUsername: 'lead_ghost', source: 'discord', interest: 'Starter Shop', budgetCents: 20000, status: 'new_lead', assignedRepId: rep.id, lastContactAt: daysFromNow(-1) },
      { discordUsername: 'lead_raven', source: 'tiktok', interest: 'Growth Shop', budgetCents: 40000, status: 'contacted', assignedRepId: rep.id },
      { discordUsername: 'lead_kilo', source: 'referral', interest: 'Premium Shop', budgetCents: 75000, status: 'ticket_opened', assignedRepId: rep.id, lastContactAt: daysFromNow(-2) },
      { discordUsername: 'lead_juno', source: 'discord', interest: 'Starter Shop', budgetCents: 25000, status: 'interested', assignedRepId: admin.id },
      { discordUsername: 'lead_vega', source: 'affiliate', interest: 'Growth Shop', budgetCents: 45000, status: 'invoice_sent', referralCode: 'ISHHY100', sourceCoachId: alpha.id, promoCodeUsed: 'ISHHY100', assignedRepId: rep.id, nextFollowUpAt: daysFromNow(1) },
      { discordUsername: 'lead_orion', source: 'discord', interest: 'Premium Shop', budgetCents: 80000, status: 'invoice_sent', assignedRepId: rep.id, nextFollowUpAt: daysFromNow(1) },
      { discordUsername: 'buyer_ace', source: 'discord', interest: 'Starter Shop', budgetCents: 25000, status: 'paid', assignedRepId: rep.id, lastContactAt: daysFromNow(-12) },
      { discordUsername: 'buyer_neo', source: 'affiliate', interest: 'Starter Shop', budgetCents: 25000, status: 'paid', referralCode: 'TITAN15', sourceCoachId: beta.id, promoCodeUsed: 'TITAN15', assignedRepId: admin.id, lastContactAt: daysFromNow(-27) },
      { discordUsername: 'lead_atlas', source: 'repeat', interest: 'Growth Shop', budgetCents: 45000, status: 'lost', assignedRepId: rep.id, notes: 'Went with a competitor.' },
      { discordUsername: 'lead_nova', source: 'other', interest: 'Premium Shop', budgetCents: 90000, status: 'lost', assignedRepId: admin.id, notes: 'Budget fell through.' },
    ])
    .returning()

  const leadByUsername = new Map(insertedLeads.map((l) => [l.discordUsername, l]))

  // --- orders (expand blueprints) + commissions -----------------------------
  const insertedOrders = []

  // One payout batch for Titan (beta) to hold the already-paid commission.
  const [titanPayout] = await db
    .insert(payouts)
    .values({
      coachId: beta.id,
      periodStart: daysFromNow(-28).toISOString().slice(0, 10),
      periodEnd: daysFromNow(-21).toISOString().slice(0, 10),
      buyerCount: 1,
      totalCents: 0, // set after we know the commission amount
      status: 'paid',
      paidAt: daysFromNow(-20),
      method: 'zelle',
      transactionRef: 'seed_payout_titan',
    })
    .returning()

  for (const b of blueprints) {
    const commissionCents = commissionForSale(b.priceCents, b.coach ? coachRate(b.coach) : null)
    const money = computeOrderMoney({ priceCents: b.priceCents, commissionCents })
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
        sourceCoachId: b.coach?.id ?? null,
        promoCodeUsed: b.coach?.promoCode ?? null,
        package: b.package,
        priceCents: b.priceCents,
        supplierPayoutCents: money.supplierPayoutCents,
        serviceFeeCents: money.serviceFeeCents,
        profitCents: money.profitCents,
        commissionCents: money.commissionCents,
        netProfitCents: money.netProfitCents,
        paymentMethod: b.paymentMethod,
        paymentStatus: b.paymentStatus,
        transactionId: `seed_txn_${Math.round(b.priceCents + b.paidDaysAgo)}`,
        paidAt,
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

    // Commission ledger row (only for attributed orders with a state hint).
    if (b.coach && b.commission) {
      const eligibleAt = new Date(paidAt.getTime() + 7 * DAY)
      const st = b.commission
      await db.insert(commissions).values({
        orderId: order.id,
        coachId: b.coach.id,
        amountCents: commissionCents,
        status: st,
        eligibleAt,
        approvedAt: st === 'approved' || st === 'paid' ? eligibleAt : null,
        tierAtApproval: st === 'approved' || st === 'paid' ? (b.coach.tier as CoachTier) : null,
        paidAt: st === 'paid' ? daysFromNow(-20) : null,
        payoutId: st === 'paid' ? titanPayout.id : null,
        cancelledAt: st === 'cancelled' ? daysFromNow(-1) : null,
        cancelReason: st === 'cancelled' ? (b.cancelReason ?? 'refund') : null,
      })
      if (st === 'paid') {
        await db.update(payouts).set({ totalCents: commissionCents }).where(eq(payouts.id, titanPayout.id))
      }
    }
  }

  // --- coach rollups (paid orders only, owed = commission - alreadyPaid) -----
  for (const coach of [alpha, beta]) {
    const coachOrders = insertedOrders.filter((o) => o.sourceCoachId === coach.id && o.paymentStatus === 'paid')
    const revenue = coachOrders.reduce((s, o) => s + o.priceCents, 0)
    const commission = coachOrders.reduce((s, o) => s + o.commissionCents, 0)
    await db
      .update(coaches)
      .set({
        closedSalesCount: coachOrders.length,
        referralsCount: coachOrders.length,
        revenueCents: revenue,
        commissionOwedCents: Math.max(0, commission - coach.commissionPaidCents),
      })
      .where(eq(coaches.id, coach.id))
  }

  // --- coach content (one sample row) ---------------------------------------
  await db.insert(coachContent).values({
    coachId: alpha.id,
    videoLink: 'https://tiktok.com/@ishhy/video/seed',
    views: 48200,
    comments: 310,
    dms: 87,
    leadsGenerated: 24,
    ticketsOpened: 11,
    buyers: 4,
    revenueCents: 120000,
  })

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
    `Seeded: 2 reps, 2 coaches, ${customerIdByUsername.size} customers, ` +
      `${insertedLeads.length} leads, ${insertedOrders.length} orders, commissions across all states, 1 payout, 2 issues, 5 tasks.`
  )
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
