'use server'

import { revalidatePath } from 'next/cache'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../db'
import { commissions, payouts, coaches } from '../db/schema'
import { requireRep } from '../auth'
import { recomputeCoachRollups } from '../automations'
import { postPayoutProof } from '../discord-posts'

const DAY = 86_400_000

export interface PayoutInput {
  method?: string | null
  transactionRef?: string | null
  notes?: string | null
}

/**
 * Batch a coach's approved, unpaid commissions into a single paid payout for the
 * current 7-day cycle: create the payout row, flip those commissions to `paid`
 * with the payout id, then refresh the coach's rollups. Returns the payout id
 * (or null when there is nothing to pay).
 */
export async function payoutCoach(coachId: string, input: PayoutInput = {}): Promise<string | null> {
  await requireRep()

  const approved = await db
    .select()
    .from(commissions)
    .where(
      and(eq(commissions.coachId, coachId), eq(commissions.status, 'approved'), isNull(commissions.payoutId))
    )
  if (approved.length === 0) return null

  const totalCents = approved.reduce((s, c) => s + c.amountCents, 0)
  const now = new Date()
  const periodStart = new Date(now.getTime() - 7 * DAY)

  const [payout] = await db
    .insert(payouts)
    .values({
      coachId,
      periodStart: periodStart.toISOString().slice(0, 10),
      periodEnd: now.toISOString().slice(0, 10),
      buyerCount: approved.length,
      totalCents,
      status: 'paid',
      paidAt: now,
      method: input.method?.trim() || null,
      transactionRef: input.transactionRef?.trim() || null,
      notes: input.notes?.trim() || null,
    })
    .returning()

  for (const c of approved) {
    await db
      .update(commissions)
      .set({ status: 'paid', paidAt: now, payoutId: payout.id })
      .where(eq(commissions.id, c.id))
  }

  await recomputeCoachRollups(coachId)

  // Announce the payout in the coach-facing Discord channel (best-effort).
  const coach = await db.query.coaches.findFirst({ where: eq(coaches.id, coachId) })
  if (coach) {
    await postPayoutProof({
      coachName: coach.name,
      amountCents: totalCents,
      buyerCount: approved.length,
      method: input.method,
      ref: input.transactionRef,
    })
  }

  revalidatePath('/payouts')
  revalidatePath('/coaches')
  return payout.id
}
