'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { coaches, coachTier, coachStatus } from '../db/schema'
import { requireRep } from '../auth'
import { recomputeCoachRollups } from '../automations'
import { hashLoginCode } from '../session'

type Tier = (typeof coachTier.enumValues)[number]
type Status = (typeof coachStatus.enumValues)[number]

export interface CoachInput {
  name: string
  coachCode?: string | null
  promoCode?: string | null
  discordUsername?: string | null
  commissionRatePercent?: number | string | null
  tier?: Tier | null
  payoutMethod?: string | null
  trackingLink?: string | null
  discordInviteLink?: string | null
  notes?: string | null
}

function percentToRate(percent: number | string | null | undefined): string | undefined {
  if (percent == null || percent === '') return undefined
  const n = typeof percent === 'string' ? parseFloat(percent) : percent
  if (!Number.isFinite(n)) return undefined
  return (n / 100).toFixed(4)
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'coach'
  )
}

export async function createCoach(input: CoachInput): Promise<string> {
  await requireRep()
  const rate = percentToRate(input.commissionRatePercent)
  const [row] = await db
    .insert(coaches)
    .values({
      name: input.name.trim(),
      coachCode: input.coachCode?.trim() || slugify(input.name),
      promoCode: input.promoCode?.trim() || null,
      discordUsername: input.discordUsername?.trim() || null,
      commissionRate: rate ?? '0.10',
      tier: input.tier ?? 'bronze',
      payoutMethod: input.payoutMethod?.trim() || null,
      trackingLink: input.trackingLink?.trim() || null,
      discordInviteLink: input.discordInviteLink?.trim() || null,
      // leadRole / partnerRole hold Discord role IDs, filled by role provisioning
      // (the Discord import / partner-role creation), not names.
      notes: input.notes?.trim() || null,
    })
    .returning()
  revalidatePath('/coaches')
  return row.id
}

export async function updateCoach(id: string, input: Partial<CoachInput>): Promise<void> {
  await requireRep()
  const patch: Partial<typeof coaches.$inferInsert> = {}
  if (input.name !== undefined) patch.name = input.name.trim()
  if (input.coachCode !== undefined) patch.coachCode = input.coachCode?.trim() || null
  if (input.promoCode !== undefined) patch.promoCode = input.promoCode?.trim() || null
  if (input.discordUsername !== undefined) patch.discordUsername = input.discordUsername?.trim() || null
  if (input.tier !== undefined && input.tier) patch.tier = input.tier
  if (input.payoutMethod !== undefined) patch.payoutMethod = input.payoutMethod?.trim() || null
  if (input.trackingLink !== undefined) patch.trackingLink = input.trackingLink?.trim() || null
  if (input.discordInviteLink !== undefined) patch.discordInviteLink = input.discordInviteLink?.trim() || null
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null
  const rate = percentToRate(input.commissionRatePercent)
  if (rate !== undefined) patch.commissionRate = rate

  await db.update(coaches).set(patch).where(eq(coaches.id, id))
  // Rate changes don't retroactively alter already-computed commissions.
  await recomputeCoachRollups(id)
  revalidatePath('/coaches')
}

export async function setCoachStatus(id: string, status: Status): Promise<void> {
  await requireRep()
  await db.update(coaches).set({ status }).where(eq(coaches.id, id))
  revalidatePath('/coaches')
}

/**
 * Generate (or rotate) a coach's login code. Returns the PLAINTEXT code to show
 * the admin ONCE — only its HMAC is stored, so it can never be read back later.
 */
export async function generateLoginCode(id: string): Promise<string> {
  await requireRep()
  const code = randomBytes(5).toString('hex').toUpperCase() // 10 hex chars
  await db.update(coaches).set({ loginCodeHash: hashLoginCode(code) }).where(eq(coaches.id, id))
  revalidatePath('/coaches')
  return code
}
