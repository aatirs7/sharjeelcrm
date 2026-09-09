import { eq, inArray } from 'drizzle-orm'
import { db } from './db'
import { commissions, orders, leads, coaches, leaderboardMonths } from './db/schema'
import { getSettings } from './settings'
import { recomputeCoachRollups } from './automations'
import { tierForBuyers } from './money'
import { getRefundSignals, type RefundSignal } from './stripe'
import { assignMemberRole } from './discord'
import { logAudit } from './audit'

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
    // Repeat-customer rule (spec §30): under 'first_only', a coach earns only on
    // the customer's first commissioned purchase.
    const { repeatCommission } = await getSettings()
    if (repeatCommission === 'first_only') {
      const priorOrders = await db.select().from(orders).where(eq(orders.customerId, order.customerId))
      const priorIds = priorOrders.map((o) => o.id).filter((oid) => oid !== order.id)
      if (priorIds.length) {
        const priorCommission = await db
          .select({ id: commissions.id })
          .from(commissions)
          .where(inArray(commissions.orderId, priorIds))
        if (priorCommission.length > 0) {
          await recomputeCoachRollups(order.sourceCoachId!)
          return // repeat purchase: no new commission under first_only
        }
      }
    }
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
export async function sweepCommissions(): Promise<{
  approved: number
  cancelled: number
  reversed: number
}> {
  const now = new Date()
  // pending/approved can still be cancelled cleanly; paid ones can only be
  // reversed (money already went out) and flagged for admin review.
  const open = await db
    .select()
    .from(commissions)
    .where(inArray(commissions.status, ['pending', 'approved', 'paid']))
  if (open.length === 0) return { approved: 0, cancelled: 0, reversed: 0 }

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
  let reversed = 0

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
      if (c.status === 'paid') {
        // Money already paid out -> reverse + flag for manual admin review (§13).
        await db
          .update(commissions)
          .set({ status: 'reversed', cancelledAt: now, cancelReason: reason, needsReview: true })
          .where(eq(commissions.id, c.id))
        touchedCoaches.add(c.coachId)
        reversed++
      } else {
        await db
          .update(commissions)
          .set({ status: 'cancelled', cancelledAt: now, cancelReason: reason })
          .where(eq(commissions.id, c.id))
        touchedCoaches.add(c.coachId)
        cancelled++
      }
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

      // Confirmed buyer -> give them the coach's Discord partner role.
      const guildId = process.env.GUILD_ID
      if (guildId && coach?.partnerRole && order.leadId) {
        const lead = leadRows.find((l) => l.id === order.leadId)
        if (lead?.discordUserId) {
          await assignMemberRole(guildId, lead.discordUserId, coach.partnerRole)
        }
      }
    }
  }

  for (const coachId of touchedCoaches) await recomputeCoachRollups(coachId)
  if (approved + cancelled + reversed > 0) {
    await logAudit(
      {
        action: 'commission.sweep',
        entity: 'commission',
        summary: `Sweep: ${approved} approved, ${cancelled} cancelled, ${reversed} reversed`,
        meta: { approved, cancelled, reversed },
      },
      { id: null, role: 'system' }
    )
  }
  return { approved, cancelled, reversed }
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

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

/**
 * Archive last month's leaderboard once, at the start of a new month (spec §17):
 * rank coaches by confirmed buyers dated to that month, attach the configured
 * rewards to the top 3, and store an immutable standings snapshot. Idempotent —
 * skips if the month is already archived. Returns the archived month or null.
 */
export async function finalizePreviousMonth(): Promise<string | null> {
  const now = new Date()
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const key = monthKey(prev)

  const existing = await db.query.leaderboardMonths.findFirst({
    where: eq(leaderboardMonths.month, key),
  })
  if (existing) return null

  const start = prev.getTime()
  const end = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  const [coachRows, ledger] = await Promise.all([
    db.select().from(coaches),
    db.select().from(commissions),
  ])
  const nameById = new Map(coachRows.map((c) => [c.id, c.name]))

  const buyers = new Map<string, number>()
  for (const c of ledger) {
    if ((c.status === 'approved' || c.status === 'paid') && c.approvedAt) {
      const t = new Date(c.approvedAt).getTime()
      if (t >= start && t < end) buyers.set(c.coachId, (buyers.get(c.coachId) ?? 0) + 1)
    }
  }

  const { leaderboardRewards } = await getSettings()
  const rewards = [leaderboardRewards.first, leaderboardRewards.second, leaderboardRewards.third]
  const standings = [...buyers.entries()]
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([coachId, n], i) => ({
      rank: i + 1,
      coachId,
      name: nameById.get(coachId) ?? '—',
      buyers: n,
      rewardCents: rewards[i] ?? 0,
    }))

  await db.insert(leaderboardMonths).values({ month: key, standings })
  return key
}
