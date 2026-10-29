import { and, eq, gte, inArray, lte } from 'drizzle-orm'
import { db } from './db'
import { leads, orders, products } from './db/schema'
import { createOrderForLead } from './deal'
import { recomputeOrderRollups } from './automations'
import { postToChannel } from './discord'
import { postAdminNotify } from './discord-posts'
import { formatCents } from './money'
import { effectivePrice } from './pricing'
import { getSetting } from './settings'
import {
  getSquareOrderReference,
  listSquarePayments,
  type SquarePayment,
  type SquareRefund,
} from './square'

/**
 * Turns Square payments into CRM sales. Shared by the webhook (real time), the
 * daily sweep (catch anything the webhook missed) and the one-off backfill.
 * Everything here is idempotent: a payment is recorded once, keyed on its
 * Square payment id (stored as the order's transactionId / the lead's
 * paymentRef), and a ticket never gets a second order.
 */

export type RecordResult =
  | { kind: 'recorded'; leadId: string; dealNumber: number; amountCents: number }
  | { kind: 'already'; paymentId: string }
  | { kind: 'not_completed'; paymentId: string; status: string }
  | { kind: 'unmatched'; payment: SquarePayment; candidates: number[] }

const PAID_MESSAGE = 'Thanks, your payment is confirmed! We will send your login details within 24-48 hours.'

export async function alreadyRecorded(paymentId: string): Promise<boolean> {
  const o = await db.query.orders.findFirst({ where: eq(orders.transactionId, paymentId), columns: { id: true } })
  if (o) return true
  const l = await db.query.leads.findFirst({ where: eq(leads.paymentRef, paymentId), columns: { id: true } })
  if (!l) return false
  // The lead has the ref; it counts as recorded once it has an order.
  const lo = await db.query.orders.findFirst({ where: eq(orders.leadId, l.id), columns: { id: true } })
  return !!lo
}

/** Record a completed payment against a specific lead. */
export async function recordForLead(leadId: string, payment: SquarePayment): Promise<RecordResult> {
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) })
  if (!lead) return { kind: 'unmatched', payment, candidates: [] }

  const existing = await db.query.orders.findFirst({ where: eq(orders.leadId, lead.id) })
  if (existing) {
    // Ticket already has a sale (e.g. recorded earlier): just remember the id.
    if (!existing.transactionId) {
      await db.update(orders).set({ transactionId: payment.id }).where(eq(orders.id, existing.id))
    }
    return { kind: 'already', paymentId: payment.id }
  }

  const product = lead.productId
    ? await db.query.products.findFirst({ where: eq(products.id, lead.productId) })
    : null
  const amountCents = payment.amount_money.amount

  await db
    .update(leads)
    .set({ status: 'payment_received', paymentMethod: 'card', paymentRef: payment.id })
    .where(eq(leads.id, lead.id))

  await createOrderForLead(
    lead.id,
    {
      packageName: product?.name ?? 'TikTok Shop Account',
      priceCents: amountCents,
      paymentMethod: 'card',
    },
    { markCompleted: false },
  )

  if (lead.discordChannelId) {
    await postToChannel(lead.discordChannelId, {
      embeds: [{ title: '✅ Payment received', description: PAID_MESSAGE, color: 0x22c55e }],
    }).catch(() => false)
  }
  return { kind: 'recorded', leadId: lead.id, dealNumber: lead.dealNumber, amountCents }
}

/**
 * Payments from the old shared (static) Square links carry no ticket id. Match
 * one to a ticket only when exactly one plausible ticket exists: waiting on a
 * card payment, sent one of the static links, owing exactly this amount, and
 * opened within the week before the payment. Otherwise leave it unmatched.
 */
export async function matchStaticPayment(payment: SquarePayment): Promise<{ leadId: string | null; candidates: number[] }> {
  const staticUrls = (await getSetting('cardPaymentLinks')).map((l) => l.url)
  if (staticUrls.length === 0) return { leadId: null, candidates: [] }
  const paidAt = new Date(payment.created_at)
  const weekBefore = new Date(paidAt.getTime() - 7 * 24 * 60 * 60 * 1000)
  const rows = await db
    .select()
    .from(leads)
    .where(
      and(
        eq(leads.status, 'waiting_payment'),
        eq(leads.paymentMethod, 'card'),
        inArray(leads.paymentLink, staticUrls),
        lte(leads.createdAt, paidAt),
        gte(leads.updatedAt, weekBefore),
      ),
    )
  const prods = rows.length
    ? await db.select().from(products).where(inArray(products.id, rows.map((r) => r.productId).filter((v): v is string => !!v)))
    : []
  const priceOf = new Map(prods.map((p) => [p.id, p.priceCents]))
  const fits = rows.filter((l) => l.productId && effectivePrice(priceOf.get(l.productId) ?? -1, l) === payment.amount_money.amount)
  return {
    leadId: fits.length === 1 ? fits[0].id : null,
    candidates: fits.map((l) => l.dealNumber),
  }
}

/** Record one Square payment if it is completed and not yet recorded. */
export async function recordSquarePayment(payment: SquarePayment): Promise<RecordResult> {
  if (payment.status !== 'COMPLETED') return { kind: 'not_completed', paymentId: payment.id, status: payment.status }
  if (await alreadyRecorded(payment.id)) return { kind: 'already', paymentId: payment.id }

  const leadId = payment.order_id ? await getSquareOrderReference(payment.order_id).catch(() => null) : null
  if (leadId) {
    const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId), columns: { id: true } })
    if (lead) return recordForLead(lead.id, payment)
  }

  const match = await matchStaticPayment(payment)
  if (match.leadId) return recordForLead(match.leadId, payment)
  return { kind: 'unmatched', payment, candidates: match.candidates }
}

/** A completed refund marks the sale refunded; the daily sweep then reverses the coach commission. */
export async function recordSquareRefund(refund: SquareRefund): Promise<'refunded' | 'partial' | 'no_order' | 'pending'> {
  if (refund.status !== 'COMPLETED') return 'pending'
  const order = await db.query.orders.findFirst({ where: eq(orders.transactionId, refund.payment_id) })
  if (!order) return 'no_order'
  if (refund.amount_money.amount < order.priceCents) {
    await postAdminNotify(
      '↩️ Partial Square refund',
      [`Order ${order.id.slice(0, 8)}`, `Refunded ${formatCents(refund.amount_money.amount)} of ${formatCents(order.priceCents)}`, 'The sale is still counted. Adjust it in the CRM if needed.'],
      0xf59e0b,
    )
    return 'partial'
  }
  await db.update(orders).set({ paymentStatus: 'refunded', status: 'refunded' }).where(eq(orders.id, order.id))
  await recomputeOrderRollups(order.id)
  return 'refunded'
}

export interface SyncSummary {
  checked: number
  recorded: { dealNumber: number; amountCents: number }[]
  already: number
  notCompleted: number
  unmatched: { paymentId: string; amountCents: number; createdAt: string; email: string | null; candidates: number[] }[]
  refunded: number
}

/**
 * Pull payments from Square since `since` and record any completed ones the
 * webhook hasn't. Fully refunded payments mark their sale refunded.
 */
export async function syncSquarePayments(since: Date, opts: { notifyUnmatched?: boolean } = {}): Promise<SyncSummary> {
  const payments = await listSquarePayments(since)
  const summary: SyncSummary = { checked: payments.length, recorded: [], already: 0, notCompleted: 0, unmatched: [], refunded: 0 }
  for (const p of payments) {
    const r = await recordSquarePayment(p)
    if (r.kind === 'recorded') summary.recorded.push({ dealNumber: r.dealNumber, amountCents: r.amountCents })
    else if (r.kind === 'already') summary.already++
    else if (r.kind === 'not_completed') summary.notCompleted++
    else
      summary.unmatched.push({
        paymentId: p.id,
        amountCents: p.amount_money.amount,
        createdAt: p.created_at,
        email: p.buyer_email_address ?? null,
        candidates: r.candidates,
      })

    const refundedCents = p.refunded_money?.amount ?? 0
    if (p.status === 'COMPLETED' && refundedCents > 0 && refundedCents >= p.amount_money.amount) {
      const order = await db.query.orders.findFirst({ where: eq(orders.transactionId, p.id) })
      if (order && order.paymentStatus !== 'refunded') {
        await db.update(orders).set({ paymentStatus: 'refunded', status: 'refunded' }).where(eq(orders.id, order.id))
        await recomputeOrderRollups(order.id)
        summary.refunded++
      }
    }
  }

  if (opts.notifyUnmatched && summary.unmatched.length > 0) {
    await postAdminNotify(
      '💳 Square payments not linked to a ticket',
      summary.unmatched.slice(0, 10).map(
        (u) =>
          `${formatCents(u.amountCents)} on ${u.createdAt.slice(0, 16).replace('T', ' ')}${u.email ? ` (${u.email})` : ''}: ${
            u.candidates.length ? `could be DEAL-${u.candidates.join(', DEAL-')}` : 'no matching ticket'
          }`,
      ),
      0xf59e0b,
    )
  }
  return summary
}
