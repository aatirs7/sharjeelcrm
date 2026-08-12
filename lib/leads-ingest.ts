import { and, eq, isNotNull } from 'drizzle-orm'
import { db } from './db'
import { leads, coaches, leadSource } from './db/schema'

export interface TicketLeadInput {
  discordUsername: string
  discordChannelId?: string | null
  ticketLink?: string | null
  source?: string | null
  interest?: string | null
  referralCode?: string | null
  ticketType?: 'purchase' | 'support' | 'question' | 'other' | null
  email?: string | null
}

/**
 * Create or update a lead from a Discord ticket. Idempotent per ticket channel
 * (updates the existing lead rather than duplicating).
 *
 * Attribution (M2): the extracted referral code is resolved to a coach by
 * `promo_code`. A valid code wins and sets `source_coach_id` + `promo_code_used`
 * (and source 'affiliate'); an unknown or missing code leaves attribution null
 * for an admin to assign manually. Shared by the Discord webhook route + poll.
 */
export async function ingestTicketLead(
  input: TicketLeadInput
): Promise<{ leadId: string; created: boolean }> {
  const referralCode = input.referralCode?.trim() || null

  let source: (typeof leadSource.enumValues)[number] = (
    leadSource.enumValues as readonly string[]
  ).includes(input.source ?? '')
    ? (input.source as (typeof leadSource.enumValues)[number])
    : 'discord'

  // Resolve the code to a coach (valid promo code wins).
  let sourceCoachId: string | null = null
  let promoCodeUsed: string | null = null
  if (referralCode) {
    const coach = await db.query.coaches.findFirst({
      where: and(eq(coaches.promoCode, referralCode), isNotNull(coaches.promoCode)),
    })
    if (coach) {
      source = 'affiliate'
      sourceCoachId = coach.id
      promoCodeUsed = coach.promoCode
    }
  }

  const values = {
    discordUsername: input.discordUsername.trim(),
    ticketLink: input.ticketLink?.trim() || null,
    discordChannelId: input.discordChannelId?.trim() || null,
    source,
    referralCode,
    sourceCoachId,
    promoCodeUsed,
    interest: input.interest?.trim() || null,
    ticketType: input.ticketType ?? null,
    email: input.email?.trim().toLowerCase() || null,
  }

  if (values.discordChannelId) {
    const existing = await db.query.leads.findFirst({
      where: eq(leads.discordChannelId, values.discordChannelId),
    })
    if (existing) {
      await db
        .update(leads)
        .set({
          discordUsername: values.discordUsername,
          ticketLink: values.ticketLink ?? existing.ticketLink,
          referralCode: values.referralCode ?? existing.referralCode,
          // Attribution is sticky — an existing coach link is never clobbered by
          // a re-poll, but a newly-matched code fills a previously-null link.
          sourceCoachId: existing.sourceCoachId ?? values.sourceCoachId,
          promoCodeUsed: existing.promoCodeUsed ?? values.promoCodeUsed,
          interest: values.interest ?? existing.interest,
          source: values.source,
          ticketType: existing.ticketType ?? values.ticketType, // don't clobber a staff tag
          email: existing.email ?? values.email, // don't clobber a set email
        })
        .where(eq(leads.id, existing.id))
      return { leadId: existing.id, created: false }
    }
  }

  const [lead] = await db.insert(leads).values(values).returning({ id: leads.id })
  return { leadId: lead.id, created: true }
}
