// Minimal Discord REST helpers for the serverless poll + interactions routes.
// Uses the bot token (BOT_TOKEN). No gateway / always-on connection.

const API = 'https://discord.com/api/v10'
const TOKEN = process.env.BOT_TOKEN
const TICKET_TOOL_ID = process.env.TICKET_TOOL_ID || '557628352828014614'
const SELF_BOT_ID = process.env.BOT_APP_ID || '1524866733079400488'

function authHeaders() {
  return { Authorization: `Bot ${TOKEN}`, 'User-Agent': 'the-desk/1.0' }
}

export async function dget<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`)
  return res.json() as Promise<T>
}

export async function dpost(path: string, body: unknown): Promise<Response> {
  return fetch(`${API}${path}`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export interface DiscordChannel {
  id: string
  name: string
  type: number
  parent_id: string | null
  permission_overwrites?: { id: string; type: number }[]
}

/** All open ticket channels (name starts with prefix), newest id first. */
export async function listTicketChannels(
  guildId: string,
  prefix = 'ticket-'
): Promise<DiscordChannel[]> {
  const chans = await dget<DiscordChannel[]>(`/guilds/${guildId}/channels`)
  return chans
    .filter((c) => c.type === 0 && c.name?.startsWith(prefix))
    .sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? 1 : -1))
}

/** The buyer = the member overwrite that isn't Ticket Tool or our own bot. */
export async function findBuyer(
  channel: DiscordChannel
): Promise<{ id: string; username: string } | null> {
  const members = (channel.permission_overwrites ?? []).filter(
    (o) => o.type === 1 && o.id !== TICKET_TOOL_ID && o.id !== SELF_BOT_ID
  )
  for (const o of members) {
    try {
      const user = await dget<{ id: string; username: string; bot?: boolean }>(`/users/${o.id}`)
      if (!user.bot) return { id: user.id, username: user.username }
    } catch {
      /* skip */
    }
  }
  return null
}

/** The buyer's first text message in the ticket (needs Message Content intent). */
export async function firstBuyerMessage(channelId: string, buyerId: string): Promise<string | null> {
  try {
    const msgs = await dget<{ id: string; content: string; author: { id: string } }[]>(
      `/channels/${channelId}/messages?after=1&limit=10`
    )
    const ordered = msgs.slice().sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1))
    const mine = ordered.filter((m) => m.author?.id === buyerId && m.content?.trim())
    return mine[0]?.content?.slice(0, 500) ?? null
  } catch {
    return null
  }
}

/** Conservative referral-code detection (AA10 / RAY10 / "code X<digit>"). */
export function detectReferralCode(text: string | null): string | null {
  if (!text) return null
  const m1 = text.match(/\b([A-Za-z]{2,4}\d{1,3})\b/)
  if (m1) return m1[1].toUpperCase()
  const m2 = text.match(/\b(?:code|promo|coupon|discount)\s*[:#-]?\s*([A-Za-z0-9]{2,10})\b/i)
  if (m2 && /\d/.test(m2[1])) return m2[1].toUpperCase()
  return null
}

/** Post the staff tag panel (Purchase / Support / Warranty) into a ticket. */
export async function postTagButtons(channelId: string, buyerUsername: string): Promise<void> {
  await dpost(`/channels/${channelId}/messages`, {
    embeds: [
      {
        title: 'The Desk — classify this ticket',
        description: `Lead created for **${buyerUsername}**. Staff: tag this ticket so the CRM knows what it is.`,
        color: 0x3b82f6,
      },
    ],
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 3, label: 'Purchase', emoji: { name: '🛒' }, custom_id: 'tag:purchase' },
          { type: 2, style: 2, label: 'Support', emoji: { name: '🛟' }, custom_id: 'tag:support' },
          { type: 2, style: 2, label: 'Warranty', emoji: { name: '🛡️' }, custom_id: 'tag:warranty' },
        ],
      },
    ],
  })
}
