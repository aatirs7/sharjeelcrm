'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { orders, orderStatus, paymentStatus, paymentMethod } from '../db/schema'
import { requireRep } from '../auth'
import {
  createDeliveryFollowupTasks,
  autoCompleteProofTask,
  autoCompleteBuyerConfirmTask,
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
    if (input.paymentStatus === 'paid' && !order.paidAt) patch.paidAt = new Date()
  }

  await db.update(orders).set(patch).where(eq(orders.id, id))
  if (input.paymentStatus !== undefined) await recomputeOrderRollups(id) // rules 7 & 8
  revalidateOrder(id)
  revalidatePath('/customers')
  revalidatePath('/affiliates')
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
