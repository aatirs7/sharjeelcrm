/**
 * Automation hooks — fired from server actions on the relevant mutation.
 * See the spec's "Automations" section (rules 1–8). Each rule is a small,
 * idempotent function invoked inline; no external queue.
 *
 *   rule 2 (payment_pending -> follow_up)          — createFollowUpTaskForLead
 *   rule 3 (paid order -> delivery task)           — createDeliveryTaskForOrder
 *   rule 5 (delivered -> proof + confirm tasks)    — createDeliveryFollowupTasks
 *   rule 5 auto-complete (proof / buyer confirmed) — autoComplete*Task
 *   rule 6 (warranty expiry)                       — M8 daily cron
 *   rules 7, 8 (customer / affiliate rollups)      — M6
 */
import { and, eq } from 'drizzle-orm'
import { db } from './db'
import { affiliates, customers, leads, orders, tasks } from './db/schema'

const HOUR = 3_600_000

/** Resolve the rep a task should go to for an order — via its origin lead. */
async function repForOrder(orderId: string): Promise<string | null> {
  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
    with: { lead: true },
  })
  return order?.lead?.assignedRepId ?? null
}

async function hasOpenTask(
  orderId: string,
  type: (typeof tasks.type.enumValues)[number]
): Promise<boolean> {
  const existing = await db.query.tasks.findFirst({
    where: and(eq(tasks.orderId, orderId), eq(tasks.type, type), eq(tasks.status, 'open')),
  })
  return !!existing
}

/**
 * Rule 2 — a lead entering `payment_pending` gets a follow-up task due in 24h,
 * assigned to the lead's rep. Deduped against existing open follow-ups.
 */
export async function createFollowUpTaskForLead(leadId: string): Promise<void> {
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) })
  if (!lead) return

  const existing = await db.query.tasks.findFirst({
    where: and(eq(tasks.leadId, leadId), eq(tasks.type, 'follow_up'), eq(tasks.status, 'open')),
  })
  if (existing) return

  await db.insert(tasks).values({
    type: 'follow_up',
    title: `Follow up on payment (${lead.discordUsername})`,
    dueAt: new Date(Date.now() + 24 * HOUR),
    leadId: lead.id,
    assignedRepId: lead.assignedRepId,
  })
}

/**
 * Rule 3 — a newly created paid order flags a delivery task, due in 24h.
 * Deduped against existing open delivery tasks for the order.
 */
export async function createDeliveryTaskForOrder(orderId: string): Promise<void> {
  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
    with: { customer: true, lead: true },
  })
  if (!order) return
  if (await hasOpenTask(orderId, 'delivery')) return

  await db.insert(tasks).values({
    type: 'delivery',
    title: `Deliver ${order.package} (${order.customer?.discordUsername ?? 'customer'})`,
    dueAt: new Date(Date.now() + 24 * HOUR),
    orderId: order.id,
    assignedRepId: order.lead?.assignedRepId ?? null,
  })
}

/**
 * Rule 5 — on delivery, remind the rep to upload proof and get buyer
 * confirmation: two tasks due in 48h. Each type deduped.
 */
export async function createDeliveryFollowupTasks(orderId: string): Promise<void> {
  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
    with: { customer: true },
  })
  if (!order) return
  const assignedRepId = await repForOrder(orderId)
  const dueAt = new Date(Date.now() + 48 * HOUR)
  const who = order.customer?.discordUsername ?? 'customer'

  if (!(await hasOpenTask(orderId, 'upload_proof'))) {
    await db.insert(tasks).values({
      type: 'upload_proof',
      title: `Upload delivery proof (${who})`,
      dueAt,
      orderId,
      assignedRepId,
    })
  }
  if (!(await hasOpenTask(orderId, 'buyer_confirmation'))) {
    await db.insert(tasks).values({
      type: 'buyer_confirmation',
      title: `Get buyer confirmation (${who})`,
      dueAt,
      orderId,
      assignedRepId,
    })
  }
}

/** Rule 5 auto-complete — proof uploaded closes the open upload_proof task. */
export async function autoCompleteProofTask(orderId: string): Promise<void> {
  await db
    .update(tasks)
    .set({ status: 'done', completedAt: new Date() })
    .where(and(eq(tasks.orderId, orderId), eq(tasks.type, 'upload_proof'), eq(tasks.status, 'open')))
}

/** Rule 5 auto-complete — buyer confirmed closes the open buyer_confirmation task. */
export async function autoCompleteBuyerConfirmTask(orderId: string): Promise<void> {
  await db
    .update(tasks)
    .set({ status: 'done', completedAt: new Date() })
    .where(
      and(eq(tasks.orderId, orderId), eq(tasks.type, 'buyer_confirmation'), eq(tasks.status, 'open'))
    )
}

/**
 * Rule 7 — recompute a customer's rollups from their orders:
 * totalOrders (all), totalSpentCents (paid only), lastPurchaseAt (latest paid).
 */
export async function recomputeCustomerRollups(customerId: string): Promise<void> {
  const rows = await db.select().from(orders).where(eq(orders.customerId, customerId))
  const paid = rows.filter((o) => o.paymentStatus === 'paid')
  const totalSpentCents = paid.reduce((s, o) => s + o.priceCents, 0)
  const paidDates = paid.map((o) => o.paidAt).filter((d): d is Date => d != null).map((d) => new Date(d).getTime())
  const lastPurchaseAt = paidDates.length ? new Date(Math.max(...paidDates)) : null

  await db
    .update(customers)
    .set({ totalOrders: rows.length, totalSpentCents, lastPurchaseAt })
    .where(eq(customers.id, customerId))
}

/**
 * Rule 8 — recompute an affiliate's rollups from orders they drove:
 * closedSalesCount + revenueCents (paid orders), commissionOwedCents
 * (sum of their paid orders' commissionCents minus commissionPaidCents).
 * referralsCount tracks all attributed orders.
 */
export async function recomputeAffiliateRollups(affiliateId: string): Promise<void> {
  const affiliate = await db.query.affiliates.findFirst({ where: eq(affiliates.id, affiliateId) })
  if (!affiliate) return
  const rows = await db.select().from(orders).where(eq(orders.affiliateId, affiliateId))
  const paid = rows.filter((o) => o.paymentStatus === 'paid')
  const revenueCents = paid.reduce((s, o) => s + o.priceCents, 0)
  const commissionTotal = paid.reduce((s, o) => s + o.commissionCents, 0)

  await db
    .update(affiliates)
    .set({
      referralsCount: rows.length,
      closedSalesCount: paid.length,
      revenueCents,
      commissionOwedCents: Math.max(0, commissionTotal - affiliate.commissionPaidCents),
    })
    .where(eq(affiliates.id, affiliateId))
}

/** Convenience — recompute both rollups touched by an order. */
export async function recomputeOrderRollups(orderId: string): Promise<void> {
  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) })
  if (!order) return
  await recomputeCustomerRollups(order.customerId)
  if (order.affiliateId) await recomputeAffiliateRollups(order.affiliateId)
}
