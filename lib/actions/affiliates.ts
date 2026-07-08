'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { affiliates } from '../db/schema'
import { requireRep } from '../auth'
import { recomputeAffiliateRollups } from '../automations'

export interface AffiliateInput {
  name: string
  discordUsername?: string | null
  commissionRatePercent?: number | string | null // entered as a percent, e.g. 10
  notes?: string | null
}

function percentToRate(percent: number | string | null | undefined): string | undefined {
  if (percent == null || percent === '') return undefined
  const n = typeof percent === 'string' ? parseFloat(percent) : percent
  if (!Number.isFinite(n)) return undefined
  return (n / 100).toFixed(4)
}

export async function createAffiliate(input: AffiliateInput): Promise<string> {
  await requireRep()
  const rate = percentToRate(input.commissionRatePercent)
  const [row] = await db
    .insert(affiliates)
    .values({
      name: input.name.trim(),
      discordUsername: input.discordUsername?.trim() || null,
      commissionRate: rate ?? '0.10',
      notes: input.notes?.trim() || null,
    })
    .returning()
  revalidatePath('/affiliates')
  return row.id
}

export async function updateAffiliate(id: string, input: Partial<AffiliateInput>): Promise<void> {
  await requireRep()
  const patch: Partial<typeof affiliates.$inferInsert> = {}
  if (input.name !== undefined) patch.name = input.name.trim()
  if (input.discordUsername !== undefined) patch.discordUsername = input.discordUsername?.trim() || null
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null
  const rate = percentToRate(input.commissionRatePercent)
  if (rate !== undefined) patch.commissionRate = rate

  await db.update(affiliates).set(patch).where(eq(affiliates.id, id))
  // Rate changes don't retroactively alter already-computed commissionCents on
  // orders, but recompute keeps owed consistent with commissionPaidCents.
  await recomputeAffiliateRollups(id)
  revalidatePath('/affiliates')
}

/**
 * Mark the affiliate's currently-owed commission as paid: bump
 * commissionPaidCents by the owed amount, then recompute so owed lands at 0.
 */
export async function markCommissionPaid(id: string): Promise<void> {
  await requireRep()
  const aff = await db.query.affiliates.findFirst({ where: eq(affiliates.id, id) })
  if (!aff) return
  if (aff.commissionOwedCents <= 0) return
  await db
    .update(affiliates)
    .set({ commissionPaidCents: aff.commissionPaidCents + aff.commissionOwedCents })
    .where(eq(affiliates.id, id))
  await recomputeAffiliateRollups(id)
  revalidatePath('/affiliates')
}
