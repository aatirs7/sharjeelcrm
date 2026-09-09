import { and, eq, isNotNull, sql } from 'drizzle-orm'
import { db } from './db'
import { leads, coaches } from './db/schema'
import { assignMemberRole, postToChannel } from './discord'
import { postAdminNotify } from './discord-posts'

type Lead = typeof leads.$inferSelect

export interface ApplyCodeResult {
  code: string
  coachName: string | null // set when the code matched a coach
  selfReferral: boolean // the buyer typed their own coach code
}

/** Normalise what a buyer typed ("aa 10", " AA10 ") into a code: upper-case, alphanumeric. */
export function normaliseCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 32)
}

/** The coach whose promo code matches (case-insensitive), or null. */
export async function findCoachByPromo(code: string) {
  const c = normaliseCode(code)
  if (!c) return null
  const coach = await db.query.coaches.findFirst({
    where: and(isNotNull(coaches.promoCode), sql`upper(${coaches.promoCode}) = ${c}`),
  })
  return coach ?? null
}

/**
 * Record a referral / promo code the buyer gave inside their ticket (spec §M2):
 * store it on the deal, link the coach when it's a known code (attribution is
 * sticky — an existing coach link is never overwritten), give the buyer the
 * coach's lead role, confirm in the ticket, and tell staff. Shared by the
 * ticket "Enter referral code" form and the hourly poll's message scan.
 */
export async function applyReferralCode(lead: Lead, rawCode: string, guildId?: string | null): Promise<ApplyCodeResult> {
  const code = normaliseCode(rawCode)
  const coach = code ? await findCoachByPromo(code) : null
  const selfReferral = Boolean(coach?.discordUserId && lead.discordUserId && coach.discordUserId === lead.discordUserId)

  const patch: Partial<typeof leads.$inferInsert> = { referralCode: code || null }
  if (coach && !selfReferral && !lead.sourceCoachId) {
    patch.sourceCoachId = coach.id
    patch.promoCodeUsed = coach.promoCode
    patch.source = 'affiliate'
  }
  await db.update(leads).set(patch).where(eq(leads.id, lead.id))

  const guild = guildId || process.env.GUILD_ID || null
  if (coach && !selfReferral && guild && lead.discordUserId && coach.leadRole) {
    await assignMemberRole(guild, lead.discordUserId, coach.leadRole)
  }

  const dealLine = `Deal: DEAL-${lead.dealNumber}`
  const customerLine = `Customer: ${lead.discordUsername}`
  if (coach && !selfReferral) {
    await postToChannel(lead.discordChannelId, {
      content: `✅ Code **${code}** applied — you're referred by **${coach.name}**. A team member will be with you shortly.`,
    })
    await postAdminNotify('🎟️ Referral code applied', [dealLine, customerLine, `Code: ${code}`, `Coach: ${coach.name}`], 0x22c55e)
  } else if (coach && selfReferral) {
    await postToChannel(lead.discordChannelId, {
      content: `📝 Code **${code}** noted. A team member will check it shortly.`,
    })
    await postAdminNotify('⚠️ Self-referral attempt', [dealLine, customerLine, `Code: ${code}`, `${coach.name} used their own code — not credited.`], 0xf59e0b)
  } else {
    await postToChannel(lead.discordChannelId, {
      content: `📝 Got it — code **${code}** noted. A team member will check it shortly.`,
    })
    await postAdminNotify('🎟️ Unknown referral code', [dealLine, customerLine, `Code: ${code}`, 'Not a known coach code — check and assign by hand if needed.'], 0xf59e0b)
  }

  return { code, coachName: coach && !selfReferral ? coach.name : null, selfReferral }
}
