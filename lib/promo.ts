import { and, eq, isNotNull } from 'drizzle-orm'
import { db } from './db'
import { leads, coaches } from './db/schema'
import { buyerMessagesText, matchKnownPromo } from './discord'
import { formatCents } from './money'

type Coach = typeof coaches.$inferSelect
type Lead = typeof leads.$inferSelect

export interface PromoResult {
  /** The coach whose promo code the buyer used, if any. */
  coach: Coach | null
  /** The matched promo code (uppercase), if any. */
  code: string | null
  /** Amount taken off the product price, in cents (0 when no valid code). */
  discountCents: number
}

/** Price the buyer actually pays: list price minus the promo discount, never below zero. */
export function applyDiscount(priceCents: number, discountCents: number): number {
  return Math.max(0, priceCents - Math.max(0, discountCents))
}

/**
 * Work out the promo discount for a ticket. The lead may already be attributed
 * (code caught at ingest); otherwise the buyer's ticket messages are scanned
 * for a known coach promo code — buyers usually drop it as a reply to the
 * welcome message, after the lead row already exists. A newly found code is
 * saved on the lead so attribution (and the coach's commission) sticks.
 */
export async function resolveLeadPromo(lead: Lead): Promise<PromoResult> {
  let coach: Coach | null = null
  if (lead.sourceCoachId) {
    coach = (await db.query.coaches.findFirst({ where: eq(coaches.id, lead.sourceCoachId) })) ?? null
  }

  if (!coach) {
    // A raw code the buyer cited but that wasn't matched at ingest (e.g. the
    // coach was added later), or a code typed into the ticket after it opened.
    let code: string | null = lead.referralCode?.trim() || null
    if (code) {
      coach = (await db.query.coaches.findFirst({ where: and(eq(coaches.promoCode, code), isNotNull(coaches.promoCode)) })) ?? null
    }
    if (!coach && lead.discordChannelId && lead.discordUserId) {
      const known = await db.select({ promoCode: coaches.promoCode }).from(coaches).where(isNotNull(coaches.promoCode))
      const codes = known.map((r) => r.promoCode!).filter(Boolean)
      const text = await buyerMessagesText(lead.discordChannelId, lead.discordUserId)
      code = matchKnownPromo(text, codes)
      if (code) {
        coach = (await db.query.coaches.findFirst({ where: and(eq(coaches.promoCode, code), isNotNull(coaches.promoCode)) })) ?? null
      }
    }
    if (coach) {
      await db
        .update(leads)
        .set({ referralCode: lead.referralCode ?? coach.promoCode, sourceCoachId: coach.id, promoCodeUsed: coach.promoCode, source: 'affiliate' })
        .where(eq(leads.id, lead.id))
    }
  }

  if (!coach || coach.status === 'banned') return { coach: null, code: null, discountCents: 0 }
  return { coach, code: coach.promoCode, discountCents: Math.max(0, coach.discountCents ?? 0) }
}

/**
 * One-line price summary for Discord embeds: "$599.00" or
 * "~~$599.00~~ **$589.00** (promo AA10 · $10.00 off)".
 */
export function priceLine(listCents: number, promo: PromoResult): string {
  if (!promo.code || promo.discountCents <= 0) return formatCents(listCents)
  const final = applyDiscount(listCents, promo.discountCents)
  return `~~${formatCents(listCents)}~~ **${formatCents(final)}** (promo ${promo.code} · ${formatCents(listCents - final)} off)`
}
