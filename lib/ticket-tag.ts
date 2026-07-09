import { eq } from 'drizzle-orm'
import { db } from './db'
import { leads } from './db/schema'

export type TicketTag = 'purchase' | 'support' | 'warranty'

/**
 * Apply a staff ticket tag to the lead for a channel. Purchase keeps it in the
 * pipeline (annotated); support/warranty marks it lost. Idempotent per channel.
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
  const notes = lead.notes ? `${lead.notes}\n${note}` : note
  if (tag === 'purchase') {
    await db.update(leads).set({ notes }).where(eq(leads.id, lead.id))
  } else {
    await db.update(leads).set({ status: 'lost', notes }).where(eq(leads.id, lead.id))
  }
  return { ok: true, leadId: lead.id }
}
