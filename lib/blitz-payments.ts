import { and, eq, gte, inArray, isNotNull } from 'drizzle-orm'
import { db } from './db'
import { leads } from './db/schema'
import { getBlitzOrderStatus } from './blitz'
import { alreadyRecorded, recordForLead, type RecordResult } from './square-payments'
import type { SquarePayment } from './square'

/**
 * Turns paid Blitz checkouts into CRM sales, through the same recordForLead
 * path Square uses (order created, ticket marked paid, buyer told in Discord).
 *
 * A deal is marked paid only when all three hold:
 *  - the order id is the one we stored on the lead when we made the checkout,
 *  - Blitz's status endpoint says PAID,
 *  - the paid amount is exactly the amount we asked for.
 * The return URL and the webhook never prove payment on their own; they only
 * trigger this check. Idempotent: the Blitz order id becomes the lead's
 * paymentRef / the order's transactionId, so it is recorded once.
 */

export type BlitzConfirm =
  | RecordResult
  | { kind: 'no_checkout' }
  | { kind: 'unpaid'; status: string }
  | { kind: 'amount_mismatch'; expected: number; got: number }

// Cancelled is included: a buyer can still pay after an idle ticket was closed.
const OPEN_STATUSES = ['new_lead', 'contacted', 'product_selected', 'waiting_payment', 'cancelled'] as const

export async function confirmBlitzForLead(leadId: string): Promise<BlitzConfirm> {
  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, leadId),
    columns: { id: true, blitzOrderId: true, blitzAmountCents: true },
  })
  if (!lead?.blitzOrderId || !lead.blitzAmountCents) return { kind: 'no_checkout' }
  if (await alreadyRecorded(lead.blitzOrderId)) return { kind: 'already', paymentId: lead.blitzOrderId }

  const s = await getBlitzOrderStatus(lead.blitzOrderId)
  if (s.status !== 'PAID') return { kind: 'unpaid', status: s.status || 'unknown' }
  if (s.amountMinorUnits !== lead.blitzAmountCents || (s.currency && s.currency !== 'USD')) {
    return { kind: 'amount_mismatch', expected: lead.blitzAmountCents, got: s.amountMinorUnits }
  }

  // recordForLead only reads id + amount; give it the Blitz order in that shape.
  const payment = {
    id: lead.blitzOrderId,
    status: 'COMPLETED',
    amount_money: { amount: lead.blitzAmountCents, currency: 'USD' },
    created_at: new Date().toISOString(),
  } as SquarePayment
  return recordForLead(lead.id, payment)
}

export interface BlitzSweep {
  checked: number
  recorded: number
  mismatched: number
  errors: number
}

/** Check every open ticket with a Blitz checkout from the last `days` days. */
export async function sweepBlitzCheckouts(days = 14, cap = 60): Promise<BlitzSweep> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const rows = await db
    .select({ id: leads.id })
    .from(leads)
    .where(
      and(
        isNotNull(leads.blitzOrderId),
        inArray(leads.status, [...OPEN_STATUSES]),
        gte(leads.updatedAt, since),
      ),
    )
    .limit(cap)
  const out: BlitzSweep = { checked: 0, recorded: 0, mismatched: 0, errors: 0 }
  for (const r of rows) {
    out.checked++
    try {
      const res = await confirmBlitzForLead(r.id)
      if (res.kind === 'recorded') out.recorded++
      if (res.kind === 'amount_mismatch') out.mismatched++
    } catch (e) {
      out.errors++
      console.error('[blitz sweep]', r.id, e)
    }
  }
  return out
}
