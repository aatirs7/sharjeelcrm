import { inArray, isNotNull, and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { leads, ticketTranscripts } from '@/lib/db/schema'
import { deleteStaleTicketChannels, fetchAllMessages, type DiscordChannel } from '@/lib/discord'

/**
 * Auto-close idle Discord tickets (Shahmir: no activity in 2-3 days -> close).
 * Discord caps a server at 500 channels and every Ticket Tool ticket is one,
 * so without this new tickets fail with "cannot create a ticket".
 *
 * Tickets for paid deals that are still being delivered (or disputed) are kept
 * no matter how quiet, so a buyer waiting on an account never loses the chat.
 *
 * Every other ticket has its whole chat saved to ticket_transcripts before the
 * channel is deleted (no saved copy, no delete), so a login handed over in a
 * ticket can still be found on the deal page after the ticket is gone.
 */
export const PROTECTED_STATUSES = ['payment_received', 'fulfillment', 'disputed'] as const

export interface SavedMessage {
  at: string
  authorId: string
  author: string
  bot: boolean
  content: string
  attachments: string[]
}

/** Copy a ticket channel's chat into ticket_transcripts (refreshing any earlier copy). */
export async function saveTicketTranscript(c: Pick<DiscordChannel, 'id' | 'name'>): Promise<boolean> {
  const raw = await fetchAllMessages(c.id)
  const messages: SavedMessage[] = raw.map((m) => {
    const embedText = (m.embeds ?? [])
      .map((e) => [e.title, e.description].filter(Boolean).join('\n'))
      .filter(Boolean)
      .join('\n\n')
    return {
      at: m.timestamp,
      authorId: m.author?.id ?? '',
      author: m.author?.global_name || m.author?.username || 'unknown',
      bot: !!m.author?.bot,
      content: [m.content, embedText].filter(Boolean).join('\n\n').slice(0, 8000),
      attachments: (m.attachments ?? []).map((a) => a.filename),
    }
  })

  const lead = await db.query.leads.findFirst({
    where: eq(leads.discordChannelId, c.id),
    columns: { id: true, discordUserId: true },
  })
  const buyerDiscordId = lead?.discordUserId ?? messages.find((m) => !m.bot && m.authorId)?.authorId ?? null

  await db
    .insert(ticketTranscripts)
    .values({
      channelId: c.id,
      channelName: c.name,
      leadId: lead?.id ?? null,
      buyerDiscordId,
      messages,
      messageCount: messages.length,
    })
    .onConflictDoUpdate({
      target: ticketTranscripts.channelId,
      set: { channelName: c.name, leadId: lead?.id ?? null, buyerDiscordId, messages, messageCount: messages.length, closedAt: new Date() },
    })
  return true
}

export async function closeIdleTickets(cap: number) {
  const guildId = process.env.GUILD_ID
  if (!guildId || !process.env.BOT_TOKEN) return { eligible: 0, deleted: 0, total: 0, kept: 0, skipped: 0 }
  const idleDays = Number(process.env.TICKET_IDLE_DAYS || '3')
  const rows = await db
    .select({ channelId: leads.discordChannelId })
    .from(leads)
    .where(and(isNotNull(leads.discordChannelId), inArray(leads.status, [...PROTECTED_STATUSES])))
  const keep = new Set(rows.map((r) => r.channelId!))
  const res = await deleteStaleTicketChannels(guildId, idleDays, cap, keep, saveTicketTranscript)
  return { ...res, kept: keep.size }
}
