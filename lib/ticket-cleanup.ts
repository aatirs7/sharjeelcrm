import { inArray, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { leads, ticketIdleNotices, ticketTranscripts } from '@/lib/db/schema'
import {
  channelMemberIds,
  ddelete,
  dget,
  fetchAllMessages,
  listGuildChannels,
  postMessage,
  snowflakeMs,
  type DiscordChannel,
  type TicketMessage,
} from '@/lib/discord'
import { postAdminNotify } from '@/lib/discord-posts'
import { crmBaseUrl } from '@/lib/app-url'

/**
 * Auto-close idle Discord tickets. Discord caps a server at 500 channels and
 * every ticket is one, so without this new tickets fail with "cannot create a
 * ticket".
 *
 * Tickets for paid deals that are still being delivered (or disputed) are kept
 * no matter how quiet. Every other ticket is warned 48 hours before it closes
 * (see closeIdleTickets), and its whole chat is saved to ticket_transcripts
 * before the channel is deleted, so a login handed over in a ticket can still
 * be found on the deal page after the ticket is gone.
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

/** A saved chat as a plain text file, for posting back into a ticket. */
export function transcriptText(channelName: string, messages: SavedMessage[]): string {
  const lines = [`Saved conversation from #${channelName}`, '']
  for (const m of messages) {
    const at = new Date(m.at).toISOString().slice(0, 16).replace('T', ' ')
    lines.push(`[${at} UTC] ${m.author}${m.bot ? ' (bot)' : ''}:`)
    if (m.content) lines.push(m.content)
    if (m.attachments.length) lines.push(`(attachment: ${m.attachments.join(', ')})`)
    lines.push('')
  }
  return lines.join('\n')
}

const DAY = 86_400_000
const WARNING_MS = 48 * 60 * 60 * 1000 // a warned ticket closes this long after the warning
const REPING_MS = DAY // staff are reminded about a waiting customer at most daily
const WARN_PER_RUN = 25
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export const IDLE_WARNING = {
  title: '⏳ This ticket will close in 48 hours',
  description:
    'This ticket has been quiet for a while, so it will close in 48 hours. Reply here if you still need anything and it will stay open.\n\n' +
    'If it does close, your conversation is saved. Just open a new ticket and we can pick up where you left off.',
  color: 0xf59e0b,
}

/**
 * Idle ticket cleanup, in three steps so nobody loses a ticket they still need:
 *  1. A ticket quiet for 3 days (7 for support tickets) gets a warning in the
 *     ticket: "closes in 48 hours, reply to keep it open".
 *  2. If the customer sent the last message (they are waiting on us), it is
 *     never warned or closed; staff get a reminder instead, at most daily.
 *  3. A warned ticket with no message after the warning closes 48 hours later,
 *     after its chat is saved (no saved copy, no delete).
 * Paid deals still being delivered or disputed are never touched. Tickets
 * staff already closed in Ticket Tool ("closed-") skip the warning.
 */
export async function closeIdleTickets(cap: number) {
  const empty = { eligible: 0, deleted: 0, total: 0, kept: 0, skipped: 0, warned: 0, staffPinged: 0 }
  const guildId = process.env.GUILD_ID
  if (!guildId || !process.env.BOT_TOKEN) return empty
  const idleMs = Number(process.env.TICKET_IDLE_DAYS || '3') * DAY
  const supportIdleMs = Number(process.env.TICKET_SUPPORT_IDLE_DAYS || '7') * DAY
  const now = Date.now()

  const chans = await listGuildChannels(guildId)
  const tickets = chans.filter((c) => c.type === 0 && /^(ticket-|closed-)/i.test(c.name))
  const ids = tickets.map((c) => c.id)
  const [leadRows, notices] = await Promise.all([
    ids.length
      ? db
          .select({
            id: leads.id,
            channelId: leads.discordChannelId,
            status: leads.status,
            ticketType: leads.ticketType,
            discordUserId: leads.discordUserId,
            dealNumber: leads.dealNumber,
            discordUsername: leads.discordUsername,
          })
          .from(leads)
          .where(inArray(leads.discordChannelId, ids))
      : Promise.resolve([]),
    db.select().from(ticketIdleNotices),
  ])
  const leadOf = new Map(leadRows.map((l) => [l.channelId!, l]))
  const noticeOf = new Map(notices.map((n) => [n.channelId, n]))
  const isProtected = (id: string) =>
    (PROTECTED_STATUSES as readonly string[]).includes(leadOf.get(id)?.status ?? '')
  const clearNotice = (id: string) => db.delete(ticketIdleNotices).where(eq(ticketIdleNotices.channelId, id))
  const lastActive = (c: DiscordChannel) => snowflakeMs(c.last_message_id || c.id)

  const toClose: DiscordChannel[] = []
  const toWarn: DiscordChannel[] = []
  for (const c of tickets) {
    const notice = noticeOf.get(c.id)
    if (isProtected(c.id)) {
      if (notice) await clearNotice(c.id)
      continue
    }
    if (notice?.kind === 'warning') {
      if (c.last_message_id !== notice.messageId) {
        await clearNotice(c.id) // someone wrote after the warning: it stays open
        noticeOf.delete(c.id)
      } else {
        if (now - notice.notedAt.getTime() >= WARNING_MS) toClose.push(c)
        continue
      }
    }
    const limit = leadOf.get(c.id)?.ticketType === 'support' ? supportIdleMs : idleMs
    if (now - lastActive(c) < limit) continue
    if (/^closed-/i.test(c.name)) toClose.push(c)
    else toWarn.push(c)
  }

  let warned = 0
  let staffPinged = 0
  toWarn.sort((a, b) => lastActive(a) - lastActive(b))
  for (const c of toWarn.slice(0, WARN_PER_RUN)) {
    const lead = leadOf.get(c.id)
    let last: TicketMessage | undefined
    try {
      last = (await dget<TicketMessage[]>(`/channels/${c.id}/messages?limit=1`))[0]
    } catch {
      continue
    }
    const customers = new Set([...channelMemberIds(c), ...(lead?.discordUserId ? [lead.discordUserId] : [])])
    if (last && !last.author?.bot && customers.has(last.author?.id)) {
      // The customer is waiting on us: keep it open and nudge staff instead.
      const notice = noticeOf.get(c.id)
      if (notice?.kind === 'staff_ping' && now - notice.notedAt.getTime() < REPING_MS) continue
      const days = Math.floor((now - lastActive(c)) / DAY)
      await postAdminNotify(
        '⏳ Customer waiting for a reply',
        [
          // The bare mention shows as "#unknown" to anyone outside the private
          // ticket, so spell out the name and link straight to it.
          `Ticket: <#${c.id}> (${c.name})`,
          lead ? `Deal: DEAL-${lead.dealNumber} (${lead.discordUsername})` : '',
          [`[Open in Discord](https://discord.com/channels/${guildId}/${c.id})`, lead ? `[Open in CRM](${crmBaseUrl()}/tickets/${lead.id})` : '']
            .filter(Boolean)
            .join(' · '),
          `Their last message was ${days} day${days === 1 ? '' : 's'} ago and nobody has answered. The ticket stays open until someone does.`,
        ],
        0xf59e0b
      ).catch(() => false)
      const row = { kind: 'staff_ping', messageId: null, notedAt: new Date() }
      await db
        .insert(ticketIdleNotices)
        .values({ channelId: c.id, ...row })
        .onConflictDoUpdate({ target: ticketIdleNotices.channelId, set: row })
      staffPinged++
      continue
    }
    const messageId = await postMessage(c.id, { embeds: [IDLE_WARNING] })
    if (!messageId) continue
    const row = { kind: 'warning', messageId, notedAt: new Date() }
    await db
      .insert(ticketIdleNotices)
      .values({ channelId: c.id, ...row })
      .onConflictDoUpdate({ target: ticketIdleNotices.channelId, set: row })
    warned++
  }

  let deleted = 0
  let skipped = 0
  for (const c of toClose.slice(0, cap)) {
    let saved = false
    try {
      saved = await saveTicketTranscript(c)
    } catch (err) {
      console.error('[tickets] could not save chat, keeping channel', c.id, err)
    }
    if (!saved) {
      skipped++
      continue
    }
    const res = await ddelete(`/channels/${c.id}`)
    if (res.ok) {
      deleted++
      await clearNotice(c.id)
    }
    await sleep(300)
  }

  return {
    eligible: toClose.length,
    deleted,
    total: chans.length,
    kept: tickets.filter((c) => isProtected(c.id)).length,
    skipped,
    warned,
    staffPinged,
  }
}
