import { eq } from 'drizzle-orm'
import { db } from './db'
import { leads, customers, orders, coaches, paymentMethod as paymentMethodEnum } from './db/schema'
import { computeOrderMoney, commissionForSale, formatCents } from './money'
import { syncOrderCommission } from './commissions'
import { createDeliveryTaskForOrder, recomputeOrderRollups } from './automations'
import { logAudit } from './audit'
import { postAdminNotify } from './discord-posts'
import { getUserAvatarUrl } from './discord'

type PaymentMethodValue = (typeof paymentMethodEnum.enumValues)[number]

export interface CreateOrderInput {
  packageName: string
  priceCents: number
  paymentMethod?: PaymentMethodValue | null
  coachId?: string | null
}

/**
 * Complete a deal: upsert the customer, create the paid order with money on
 * write, mark the deal `completed` (which is what fires the commission), fire
 * delivery task + rollups, audit, and notify. Shared by the CRM convert action
 * and the in-Discord "Mark completed" button. Returns the new order id.
 */
export async function createOrderForLead(leadId: string, input: CreateOrderInput): Promise<string> {
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) })
  if (!lead) throw new Error('Deal not found')

  // Recognize repeat customers by stable Discord id first (§30), then username.
  let customer = lead.discordUserId
    ? await db.query.customers.findFirst({ where: eq(customers.discordId, lead.discordUserId) })
    : undefined
  if (!customer) {
    customer = await db.query.customers.findFirst({
      where: eq(customers.discordUsername, lead.discordUsername),
    })
  }
  if (!customer) {
    const avatarUrl = lead.discordUserId ? await getUserAvatarUrl(lead.discordUserId) : null
    const [created] = await db
      .insert(customers)
      .values({
        discordUsername: lead.discordUsername,
        discordId: lead.discordUserId ?? null,
        avatarUrl,
        displayName: lead.discordUsername,
      })
      .returning()
    customer = created
  } else if (lead.discordUserId && !customer.discordId) {
    // Backfill the Discord id on an older username-keyed customer.
    await db.update(customers).set({ discordId: lead.discordUserId }).where(eq(customers.id, customer.id))
  }

  let coachId = input.coachId || lead.sourceCoachId || null
  if (!coachId && lead.referralCode) {
    const byCode = await db.query.coaches.findFirst({ where: eq(coaches.promoCode, lead.referralCode) })
    if (byCode) coachId = byCode.id
  }
  let coach: typeof coaches.$inferSelect | undefined
  if (coachId) {
    coach = await db.query.coaches.findFirst({ where: eq(coaches.id, coachId) })
    if (!coach) coachId = null
  }

  const priceCents = input.priceCents
  const commissionCents = commissionForSale(priceCents, coach ?? null)
  const money = computeOrderMoney({ priceCents, commissionCents })

  const [order] = await db
    .insert(orders)
    .values({
      leadId,
      customerId: customer.id,
      sourceCoachId: coachId,
      promoCodeUsed: coach?.promoCode ?? lead.promoCodeUsed ?? null,
      package: input.packageName.trim(),
      priceCents,
      supplierPayoutCents: money.supplierPayoutCents,
      serviceFeeCents: money.serviceFeeCents,
      profitCents: money.profitCents,
      commissionCents: money.commissionCents,
      netProfitCents: money.netProfitCents,
      // Fall back to what the buyer chose in the ticket (card / crypto).
      paymentMethod: input.paymentMethod ?? lead.paymentMethod ?? null,
      paymentLink: lead.paymentLink ?? null,
      transactionId: lead.paymentRef ?? null,
      paymentStatus: 'paid',
      paidAt: new Date(),
      status: 'paid',
    })
    .returning()

  await db.update(leads).set({ status: 'completed' }).where(eq(leads.id, leadId))
  await createDeliveryTaskForOrder(order.id)
  await syncOrderCommission(order.id)
  await recomputeOrderRollups(order.id)

  await logAudit({
    action: 'deal.completed',
    entity: 'deal',
    entityRef: `DEAL-${lead.dealNumber}`,
    summary: `Deal completed: ${input.packageName.trim()} for ${formatCents(priceCents)}${coach ? ` (coach ${coach.name})` : ''}`,
    meta: { orderId: order.id, priceCents, coachId },
  })
  await postAdminNotify(
    '💰 New sale',
    [
      `Deal: DEAL-${lead.dealNumber}`,
      `Customer: ${lead.discordUsername}`,
      `Product: ${input.packageName.trim()}`,
      `Amount: ${formatCents(priceCents)}`,
      coach ? `Referrer: ${coach.name} (${formatCents(commissionCents)} commission)` : 'Referrer: none',
    ],
    0x22c55e
  )
  return order.id
}
