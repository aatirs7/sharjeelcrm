'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { orders, coaches, leads, orderStatus, paymentStatus, paymentMethod } from '../db/schema'
import { requireRep } from '../auth'
import { computeOrderMoney, commissionForSale } from '../money'
import { syncOrderCommission } from '../commissions'
import {
  createDeliveryFollowupTasks,
  autoCompleteProofTask,
  autoCompleteBuyerConfirmTask,
  recomputeCoachRollups,
  recomputeOrderRollups,
} from '../automations'

type OrderStatusValue = (typeof orderStatus.enumValues)[number]
type PaymentStatusValue = (typeof paymentStatus.enumValues)[number]
type PaymentMethodValue = (typeof paymentMethod.enumValues)[number]

const DAY = 86_400_000

function revalidateOrder(id: string) {
  revalidatePath('/orders')
  revalidatePath(`/orders/${id}`)
}

export interface UpdatePaymentInput {
  paymentMethod?: PaymentMethodValue | null
  paymentStatus?: PaymentStatusValue
  transactionId?: string | null
  paymentLink?: string | null
}

/**
 * Update payment fields. When paymentStatus first becomes `paid`, stamp paidAt.
 * Order status is managed separately (setOrderStatus / markDelivered).
 */
export async function updateOrderPayment(id: string, input: UpdatePaymentInput): Promise<void> {
  await requireRep()
  const order = await db.query.orders.findFirst({ where: eq(orders.id, id) })
  if (!order) throw new Error('Order not found')

  const patch: Partial<typeof orders.$inferInsert> = {}
  if (input.paymentMethod !== undefined) patch.paymentMethod = input.paymentMethod
  if (input.transactionId !== undefined) patch.transactionId = input.transactionId?.trim() || null
  if (input.paymentLink !== undefined) patch.paymentLink = input.paymentLink?.trim() || null
  if (input.paymentStatus !== undefined) {
    patch.paymentStatus = input.paymentStatus
    if (input.paymentStatus === 'paid' && !order.paidAt) {
      patch.paidAt = new Date()
      // Lock attribution at paid time: if the order has no coach yet, inherit
      // the origin lead's resolved coach and freeze it onto the order.
      if (!order.sourceCoachId && order.leadId) {
        const lead = await db.query.leads.findFirst({ where: eq(leads.id, order.leadId) })
        if (lead?.sourceCoachId) {
          patch.sourceCoachId = lead.sourceCoachId
          patch.promoCodeUsed = lead.promoCodeUsed ?? lead.referralCode ?? null
          const coach = await db.query.coaches.findFirst({
            where: eq(coaches.id, lead.sourceCoachId),
          })
          const commissionCents = commissionForSale(order.priceCents, coach ?? null)
          patch.commissionCents = commissionCents
          patch.netProfitCents = order.profitCents - commissionCents
        }
      }
    }
  }

  await db.update(orders).set(patch).where(eq(orders.id, id))
  if (input.paymentStatus !== undefined) {
    await syncOrderCommission(id) // create/refresh/cancel the commission (M3)
    await recomputeOrderRollups(id) // rules 7 & 8
  }
  revalidateOrder(id)
  revalidatePath('/customers')
  revalidatePath('/coaches')
}

/**
 * Admin: assign (or clear) the coach credited for an order. Recomputes the
 * commission amount + net profit for the new coach and refreshes rollups for
 * both the previous and new coach. (M3 keeps the commission ledger row in sync.)
 */
export async function assignOrderCoach(id: string, coachId: string | null): Promise<void> {
  await requireRep()
  const order = await db.query.orders.findFirst({ where: eq(orders.id, id) })
  if (!order) throw new Error('Order not found')
  const previousCoachId = order.sourceCoachId

  const coach = coachId
    ? await db.query.coaches.findFirst({ where: eq(coaches.id, coachId) })
    : null
  const commissionCents = commissionForSale(order.priceCents, coach ?? null)
  const money = computeOrderMoney({ priceCents: order.priceCents, commissionCents })

  await db
    .update(orders)
    .set({
      sourceCoachId: coach?.id ?? null,
      promoCodeUsed: coach?.promoCode ?? null,
      commissionCents,
      netProfitCents: money.netProfitCents,
    })
    .where(eq(orders.id, id))

  await syncOrderCommission(id) // create/refresh/cancel the commission for the new coach
  if (previousCoachId && previousCoachId !== coach?.id) await recomputeCoachRollups(previousCoachId)
  if (coach) await recomputeCoachRollups(coach.id)
  revalidateOrder(id)
  revalidatePath('/coaches')
}

/**
 * Move an order through its fulfillment machine. `delivered` is intentionally
 * excluded — use markDelivered so warranty dates get auto-calculated.
 */
export async function setOrderStatus(
  id: string,
  status: Exclude<OrderStatusValue, 'delivered'>
): Promise<void> {
  await requireRep()
  await db.update(orders).set({ status }).where(eq(orders.id, id))
  revalidateOrder(id)
}

/**
 * Rule 4 — mark delivered: set deliveredAt = now, deliveryStatus = delivered,
 * warrantyStart = deliveredAt, warrantyEnd = warrantyStart + warrantyDays,
 * status = delivered. Then fires rule 5 (proof + buyer-confirmation tasks).
 */
export async function markDelivered(id: string): Promise<void> {
  await requireRep()
  const order = await db.query.orders.findFirst({ where: eq(orders.id, id) })
  if (!order) throw new Error('Order not found')

  const deliveredAt = new Date()
  const warrantyEnd = new Date(deliveredAt.getTime() + order.warrantyDays * DAY)

  await db
    .update(orders)
    .set({
      deliveredAt,
      deliveryStatus: 'delivered',
      warrantyStart: deliveredAt,
      warrantyEnd,
      status: 'delivered',
    })
    .where(eq(orders.id, id))
  await createDeliveryFollowupTasks(id) // rule 5
  revalidateOrder(id)
  revalidatePath('/')
}

/**
 * Set the delivery-proof URL. When a URL is set, auto-completes the open
 * `upload_proof` task (rule 5).
 */
export async function setDeliveryProof(id: string, url: string | null): Promise<void> {
  await requireRep()
  const cleaned = url?.trim() || null
  await db.update(orders).set({ deliveryProofUrl: cleaned }).where(eq(orders.id, id))
  if (cleaned) await autoCompleteProofTask(id)
  revalidateOrder(id)
  revalidatePath('/')
}

/**
 * Toggle buyer confirmation. Stamps buyerConfirmedAt when set true and
 * auto-completes the open `buyer_confirmation` task (rule 5).
 */
export async function setBuyerConfirmed(id: string, confirmed: boolean): Promise<void> {
  await requireRep()
  await db
    .update(orders)
    .set({ buyerConfirmed: confirmed, buyerConfirmedAt: confirmed ? new Date() : null })
    .where(eq(orders.id, id))
  if (confirmed) await autoCompleteBuyerConfirmTask(id)
  revalidateOrder(id)
  revalidatePath('/')
}
