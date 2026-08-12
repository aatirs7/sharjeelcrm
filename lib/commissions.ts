import { eq, inArray } from 'drizzle-orm'
import { db } from './db'
import { commissions, orders, leads, coaches } from './db/schema'
import { recomputeCoachRollups } from './automations'
import { tierForBuyers } from './money'
import { getRefundSignals, type RefundSignal } from './stripe'

const DAY = 86_400_000

/**
 * Keep an order's commission ledger row in sync with its current attribution +
 * payment. Called after any mutation that can change either.
 *
 * - Paid + attributed, no row yet  -> create a `pending` commission, eligible
 *   7 days after paidAt, amount = the order's commissionCents (provisional).
 * - Paid + attributed, `pending` row -> refresh coach/amount/eligibility (e.g.
 *   after a coach reassignment).
 * - Not paid, or attribution cleared, and the row is still `pending` -> delete
 *   it (never earned). Approved/paid/cancelled rows are frozen and left alone.
 */
export async function syncOrderCommission(orderId: string): Promise<void> {
  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) })
  if (!order) return
  const existing = await db.query.commissions.findFirst({
    where: eq(commissions.orderId, orderId),
  })

  const attributedAndPaid = order.paymentStatus === 'paid' && !!order.sourceCoachId
  if (!attributedAndPaid) {
    if (existing && existing.status === 'pending') {
      await db.delete(commissions).where(eq(commissions.id, existing.id))
      if (order.sourceCoachId) await recomputeCoachRollups(order.sourceCoachId)
    }
    return
  }

  const eligibleAt = new Date((order.paidAt ? new Date(order.paidAt).getTime() : Date.now()) + 7 * DAY)
  if (!existing) {
    await db.insert(commissions).values({
      orderId: order.id,
      coachId: order.sourceCoachId!,
      amountCents: order.commissionCents,
      status: 'pending',
      eligibleAt,
    })
  } else if (existing.status === 'pending') {
    await db
      .update(commissions)
      .set({
        coachId: order.sourceCoachId!,
        amountCents: order.commissionCents,
        eligibleAt,
      })
      .where(eq(commissions.id, existing.id))
  }
  await recomputeCoachRollups(order.sourceCoachId!)
}

/** Does a Stripe refund/chargeback match this order? Charge id first, else email+amount. */
function refundMatch(
  order: { transactionId: string | null; priceCents: number },
  email: string | null,
  signals: RefundSignal[]
): 'refund' | 'chargeback' | null {
  const byId = order.transactionId
    ? signals.find((s) => s.chargeId === order.transactionId)
    : undefined
  const hit =
    byId ??
    (email
      ? signals.find(
          (s) => s.email && s.email.toLowerCase() === email.toLowerCase() && s.amountCents === order.priceCents
        )
      : undefined)
  return hit ? hit.kind : null
}

/**
 * The 7-day sweep (runs in the daily cron). For every pending/approved commission:
 *  - if the order was refunded or disputed (rep-set status OR live Stripe signal),
 *    cancel the commission with the reason;
 *  - else if a pending commission has passed its eligibility date, approve it,
 *    freezing the coach's tier and the amount.
 */
export async function sweepCommissions(): Promise<{ approved: number; cancelled: number }> {
  const now = new Date()
  const open = await db
    .select()
    .from(commissions)
    .where(inArray(commissions.status, ['pending', 'approved']))
  if (open.length === 0) return { approved: 0, cancelled: 0 }

  const orderIds = [...new Set(open.map((c) => c.orderId))]
  const orderRows = await db.select().from(orders).where(inArray(orders.id, orderIds))
  const orderById = new Map(orderRows.map((o) => [o.id, o]))

  // Buyer emails via the origin leads (Stripe matches on billing email).
  const leadIds = orderRows.map((o) => o.leadId).filter((v): v is string => !!v)
  const leadRows = leadIds.length ? await db.select().from(leads).where(inArray(leads.id, leadIds)) : []
  const emailByLead = new Map(leadRows.map((l) => [l.id, l.email]))

  const { signals } = await getRefundSignals()

  const touchedCoaches = new Set<string>()
  let approved = 0
  let cancelled = 0

  for (const c of open) {
    const order = orderById.get(c.orderId)
    if (!order) continue
    const email = order.leadId ? emailByLead.get(order.leadId) ?? null : null

    const reason =
      order.paymentStatus === 'refunded'
        ? 'refund'
        : order.paymentStatus === 'chargeback'
          ? 'chargeback'
          : refundMatch(order, email, signals)

    if (reason) {
      await db
        .update(commissions)
        .set({ status: 'cancelled', cancelledAt: now, cancelReason: reason })
        .where(eq(commissions.id, c.id))
      touchedCoaches.add(c.coachId)
      cancelled++
      continue
    }

    if (c.status === 'pending' && c.eligibleAt && new Date(c.eligibleAt) <= now) {
      // Freeze the coach's tier at the moment of approval.
      const coach = await db.query.coaches.findFirst({ where: eq(coaches.id, c.coachId) })
      await db
        .update(commissions)
        .set({ status: 'approved', approvedAt: now, tierAtApproval: coach?.tier ?? null })
        .where(eq(commissions.id, c.id))
      touchedCoaches.add(c.coachId)
      approved++
    }
  }

  for (const coachId of touchedCoaches) await recomputeCoachRollups(coachId)
  return { approved, cancelled }
}

/**
 * Resolve and store each coach's tier from their confirmed buyers THIS MONTH (a
 * confirmed buyer is a commission that reached approved/paid, dated by approval).
 * Runs in the daily sweep so tier is never computed during a page render.
 * Returns how many coach tiers changed.
 */
export async function assignMonthlyTiers(): Promise<number> {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()

  const [coachRows, ledger] = await Promise.all([
    db.select().from(coaches),
    db.select().from(commissions),
  ])

  const buyersThisMonth = new Map<string, number>()
  for (const c of ledger) {
    if ((c.status === 'approved' || c.status === 'paid') && c.approvedAt) {
      if (new Date(c.approvedAt).getTime() >= monthStart) {
        buyersThisMonth.set(c.coachId, (buyersThisMonth.get(c.coachId) ?? 0) + 1)
      }
    }
  }

  let changed = 0
  for (const coach of coachRows) {
    const tier = tierForBuyers(buyersThisMonth.get(coach.id) ?? 0)
    if (tier !== coach.tier) {
      await db.update(coaches).set({ tier }).where(eq(coaches.id, coach.id))
      changed++
    }
  }
  return changed
}
