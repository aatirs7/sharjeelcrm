import { inArray, isNotNull, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import { leads } from '@/lib/db/schema'
import { deleteStaleTicketChannels } from '@/lib/discord'

/**
 * Auto-close idle Discord tickets (Shahmir: no activity in 2-3 days -> close).
 * Discord caps a server at 500 channels and every Ticket Tool ticket is one,
 * so without this new tickets fail with "cannot create a ticket".
 *
 * Tickets for paid deals that are still being delivered (or disputed) are kept
 * no matter how quiet, so a buyer waiting on an account never loses the chat.
 */
export const PROTECTED_STATUSES = ['payment_received', 'fulfillment', 'disputed'] as const

export async function closeIdleTickets(cap: number) {
  const guildId = process.env.GUILD_ID
  if (!guildId || !process.env.BOT_TOKEN) return { eligible: 0, deleted: 0, total: 0, kept: 0 }
  const idleDays = Number(process.env.TICKET_IDLE_DAYS || '3')
  const rows = await db
    .select({ channelId: leads.discordChannelId })
    .from(leads)
    .where(and(isNotNull(leads.discordChannelId), inArray(leads.status, [...PROTECTED_STATUSES])))
  const keep = new Set(rows.map((r) => r.channelId!))
  const res = await deleteStaleTicketChannels(guildId, idleDays, cap, keep)
  return { ...res, kept: keep.size }
}
