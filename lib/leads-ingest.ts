import { and, eq, isNotNull } from 'drizzle-orm'
import { db } from './db'
import { leads, affiliates, leadSource } from './db/schema'

export interface TicketLeadInput {
  discordUsername: string
  discordChannelId?: string | null
  ticketLink?: string | null
  source?: string | null
  interest?: string | null
  referralCode?: string | null
  ticketType?: 'purchase' | 'support' | 'question' | 'other' | null
}

/**
 * Create or update a lead from a Discord ticket. Idempotent per ticket channel
 * (updates the existing lead rather than duplicating). If the referral code
 * matches an affiliate, source becomes 'affiliate'. Shared by the Discord
 * webhook route and the hourly poll.
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
  if (referralCode) {
    const aff = await db.query.affiliates.findFirst({
      where: and(eq(affiliates.referralCode, referralCode), isNotNull(affiliates.referralCode)),
    })
    if (aff) source = 'affiliate'
  }

  const values = {
    discordUsername: input.discordUsername.trim(),
    ticketLink: input.ticketLink?.trim() || null,
    discordChannelId: input.discordChannelId?.trim() || null,
    source,
    referralCode,
    interest: input.interest?.trim() || null,
    ticketType: input.ticketType ?? null,
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
          interest: values.interest ?? existing.interest,
          source: values.source,
          ticketType: existing.ticketType ?? values.ticketType, // don't clobber a staff tag
        })
        .where(eq(leads.id, existing.id))
      return { leadId: existing.id, created: false }
    }
  }

  const [lead] = await db.insert(leads).values(values).returning({ id: leads.id })
  return { leadId: lead.id, created: true }
}
