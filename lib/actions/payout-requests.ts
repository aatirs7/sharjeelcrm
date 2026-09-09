'use server'

import { revalidatePath } from 'next/cache'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../db'
import { payoutRequests, commissions, coaches } from '../db/schema'
import { getCurrentCoachId, requireCapability } from '../auth'
import { payoutCoach } from './payouts'
import { postAdminNotify } from '../discord-posts'
import { formatCents } from '../money'
import { logAudit } from '../audit'

/** A coach requests payout of their approved, unpaid commission (spec §28). */
export async function requestPayout(note?: string | null): Promise<void> {
  const coachId = await getCurrentCoachId()
  if (!coachId) throw new Error('Coach session required')

  const approved = await db
    .select()
    .from(commissions)
    .where(and(eq(commissions.coachId, coachId), eq(commissions.status, 'approved'), isNull(commissions.payoutId)))
  const amountCents = approved.reduce((s, c) => s + c.amountCents, 0)
  if (amountCents <= 0) throw new Error('Nothing available to request')

  // Don't stack requests.
  const existing = await db
    .select()
    .from(payoutRequests)
    .where(and(eq(payoutRequests.coachId, coachId), eq(payoutRequests.status, 'pending')))
  if (existing.length) throw new Error('You already have a pending request')

  await db.insert(payoutRequests).values({ coachId, amountCents, note: note?.trim() || null })
  const coach = await db.query.coaches.findFirst({ where: eq(coaches.id, coachId) })
  await postAdminNotify(
    '🙋 Payout requested',
    [`Coach: ${coach?.name ?? '—'}`, `Available: ${formatCents(amountCents)}`],
    0x6f9bff
  )
  revalidatePath('/coach')
  revalidatePath('/payouts')
}

/** Admin: approve a request and pay it out in one step. */
export async function approvePayoutRequest(id: string, input: { method?: string; ref?: string } = {}): Promise<void> {
  await requireCapability('payouts')
  const [reqRow] = await db.select().from(payoutRequests).where(eq(payoutRequests.id, id))
  if (!reqRow || reqRow.status !== 'pending') return
  const payoutId = await payoutCoach(reqRow.coachId, { method: input.method, transactionRef: input.ref })
  await db
    .update(payoutRequests)
    .set({ status: payoutId ? 'paid' : 'approved', payoutId: payoutId ?? null, resolvedAt: new Date() })
    .where(eq(payoutRequests.id, id))
  await logAudit({ action: 'payout_request.approve', entity: 'payout', entityRef: id.slice(0, 8), summary: 'Approved + paid a payout request' })
  revalidatePath('/payouts')
}

export async function rejectPayoutRequest(id: string, note?: string | null): Promise<void> {
  await requireCapability('payouts')
  await db
    .update(payoutRequests)
    .set({ status: 'rejected', note: note?.trim() || null, resolvedAt: new Date() })
    .where(eq(payoutRequests.id, id))
  await logAudit({ action: 'payout_request.reject', entity: 'payout', entityRef: id.slice(0, 8), summary: 'Rejected a payout request' })
  revalidatePath('/payouts')
}
