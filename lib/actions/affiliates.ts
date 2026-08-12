'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { coaches } from '../db/schema'
import { requireRep } from '../auth'
import { recomputeCoachRollups } from '../automations'

// NOTE: this is the interim admin surface for coaches (formerly "affiliates").
// M4 replaces it with the full /coaches admin (login codes, tiers, status).

export interface AffiliateInput {
  name: string
  discordUsername?: string | null
  referralCode?: string | null // maps to coaches.promoCode
  commissionRatePercent?: number | string | null // entered as a percent, e.g. 10
  notes?: string | null
}

function percentToRate(percent: number | string | null | undefined): string | undefined {
  if (percent == null || percent === '') return undefined
  const n = typeof percent === 'string' ? parseFloat(percent) : percent
  if (!Number.isFinite(n)) return undefined
  return (n / 100).toFixed(4)
}

/** Derive a URL-safe coach handle from a display name. */
function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'coach'
  )
}

export async function createAffiliate(input: AffiliateInput): Promise<string> {
  await requireRep()
  const rate = percentToRate(input.commissionRatePercent)
  const [row] = await db
    .insert(coaches)
    .values({
      name: input.name.trim(),
      coachCode: slugify(input.name),
      discordUsername: input.discordUsername?.trim() || null,
      promoCode: input.referralCode?.trim() || null,
      commissionRate: rate ?? '0.10',
      notes: input.notes?.trim() || null,
    })
    .returning()
  revalidatePath('/affiliates')
  return row.id
}

export async function updateAffiliate(id: string, input: Partial<AffiliateInput>): Promise<void> {
  await requireRep()
  const patch: Partial<typeof coaches.$inferInsert> = {}
  if (input.name !== undefined) patch.name = input.name.trim()
  if (input.discordUsername !== undefined) patch.discordUsername = input.discordUsername?.trim() || null
  if (input.referralCode !== undefined) patch.promoCode = input.referralCode?.trim() || null
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null
  const rate = percentToRate(input.commissionRatePercent)
  if (rate !== undefined) patch.commissionRate = rate

  await db.update(coaches).set(patch).where(eq(coaches.id, id))
  // Rate changes don't retroactively alter already-computed commissionCents on
  // orders, but recompute keeps owed consistent with commissionPaidCents.
  await recomputeCoachRollups(id)
  revalidatePath('/affiliates')
}

/**
 * Mark the coach's currently-owed commission as paid: bump commissionPaidCents
 * by the owed amount, then recompute so owed lands at 0.
 */
export async function markCommissionPaid(id: string): Promise<void> {
  await requireRep()
  const coach = await db.query.coaches.findFirst({ where: eq(coaches.id, id) })
  if (!coach) return
  if (coach.commissionOwedCents <= 0) return
  await db
    .update(coaches)
    .set({ commissionPaidCents: coach.commissionPaidCents + coach.commissionOwedCents })
    .where(eq(coaches.id, id))
  await recomputeCoachRollups(id)
  revalidatePath('/affiliates')
}
