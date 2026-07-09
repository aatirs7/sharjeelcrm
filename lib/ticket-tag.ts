import { eq } from 'drizzle-orm'
import { db } from './db'
import { leads } from './db/schema'

export type TicketTag = 'purchase' | 'support' | 'question'

/**
 * Apply a staff ticket tag: sets the lead's ticketType (drives the tabs) and
 * annotates the notes. Idempotent per channel.
 */
export async function applyTicketTag(
  discordChannelId: string,
  tag: TicketTag
): Promise<{ ok: boolean; leadId?: string }> {
  const lead = await db.query.leads.findFirst({
    where: eq(leads.discordChannelId, discordChannelId),
  })
  if (!lead) return { ok: false }

  const note = `[bot] tagged as ${tag}`
  await db
    .update(leads)
    .set({ ticketType: tag, notes: lead.notes ? `${lead.notes}\n${note}` : note })
    .where(eq(leads.id, lead.id))
  return { ok: true, leadId: lead.id }
}
