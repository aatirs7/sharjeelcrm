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

export async function dput(path: string): Promise<Response> {
  return fetch(`${API}${path}`, { method: 'PUT', headers: authHeaders() })
}

export async function ddelete(path: string): Promise<Response> {
  return fetch(`${API}${path}`, { method: 'DELETE', headers: authHeaders() })
}

export async function dpatch(path: string, body: unknown): Promise<Response> {
  return fetch(`${API}${path}`, {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export interface BotProfile {
  id: string
  username: string
  avatarUrl: string | null
}

/** Our own bot's name + profile picture, or null when the token isn't set / Discord is down. */
export async function getBotProfile(): Promise<BotProfile | null> {
  if (!TOKEN) return null
  try {
    const u = await dget<{ id: string; username: string; avatar: string | null }>('/users/@me')
    return {
      id: u.id,
      username: u.username,
      avatarUrl: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=256` : null,
    }
  } catch {
    return null
  }
}

/**
 * Change the bot's Discord profile picture. `image` is the raw file bytes
 * (png / jpg / gif, under 10 MB). Discord wants a base64 data URI. Throws
 * with Discord's error text when rejected (e.g. rate-limited: avatars can
 * only be changed a couple of times per ~10 minutes).
 */
export async function setBotAvatar(image: Buffer | Uint8Array, mime: string): Promise<BotProfile> {
  if (!TOKEN) throw new Error('BOT_TOKEN is not configured')
  const b64 = Buffer.from(image).toString('base64')
  const res = await dpatch('/users/@me', { avatar: `data:${mime};base64,${b64}` })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Discord rejected the picture (${res.status}) ${text}`.trim())
  }
  const u = (await res.json()) as { id: string; username: string; avatar: string | null }
  return {
    id: u.id,
    username: u.username,
    avatarUrl: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=256` : null,
  }
}

/** A user's avatar CDN url, or null. Best-effort (needs the bot token). */
export async function getUserAvatarUrl(userId: string): Promise<string | null> {
  try {
    const u = await dget<{ avatar: string | null }>(`/users/${userId}`)
    return u.avatar ? `https://cdn.discordapp.com/avatars/${userId}/${u.avatar}.png` : null
  } catch {
    return null
  }
}

const DISCORD_EPOCH = 1420070400000
/** Channel/message creation time in ms, decoded from its snowflake id. */
export function snowflakeMs(id: string): number {
  return Number(BigInt(id) >> BigInt(22)) + DISCORD_EPOCH
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Delete ticket channels older than `olderThanDays` (both `ticket-*` and
 * `closed-*`), capped per run so a large backlog drains gradually instead of a
 * mass purge. Keeps the guild under Discord's ~500-channel limit. CRM lead rows
 * are untouched — only the Discord channel is removed.
 */
export async function deleteStaleTicketChannels(
  guildId: string,
  olderThanDays: number,
  cap = 30
): Promise<{ eligible: number; deleted: number }> {
  const chans = await dget<DiscordChannel[]>(`/guilds/${guildId}/channels`)
  const cutoff = Date.now() - olderThanDays * 86_400_000
  const stale = chans
    .filter((c) => c.type === 0 && /^(ticket-|closed-)/i.test(c.name) && snowflakeMs(c.id) < cutoff)
    .sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1)) // oldest first
  let deleted = 0
  for (const c of stale.slice(0, cap)) {
    const res = await ddelete(`/channels/${c.id}`)
    if (res.ok) deleted++
    await sleep(300) // stay within channel-delete rate limits
  }
  return { eligible: stale.length, deleted }
}

export interface DiscordRole {
  id: string
  name: string
  position: number
}

const VIEW_CHANNEL = BigInt(1024) // 1 << 10
const SEND_MESSAGES = BigInt(2048) // 1 << 11

/**
 * Create a private ticket channel for a buyer (spec §3/§4): only the buyer, the
 * bot, and staff-with-admin can see it (@everyone is denied view). Returns the
 * new channel id, or null on failure.
 */
export async function createTicketChannel(
  guildId: string,
  buyerId: string,
  name: string
): Promise<string | null> {
  const overwrites = [
    { id: guildId, type: 0, deny: String(VIEW_CHANNEL) }, // @everyone: no view
    { id: buyerId, type: 1, allow: String(VIEW_CHANNEL | SEND_MESSAGES) }, // buyer
  ]
  if (SELF_BOT_ID) overwrites.push({ id: SELF_BOT_ID, type: 1, allow: String(VIEW_CHANNEL | SEND_MESSAGES) })
  const body: Record<string, unknown> = {
    name: name.slice(0, 90),
    type: 0,
    permission_overwrites: overwrites,
  }
  if (process.env.TICKET_CATEGORY_ID) body.parent_id = process.env.TICKET_CATEGORY_ID
  const res = await dpost(`/guilds/${guildId}/channels`, body)
  if (!res.ok) return null
  const ch = (await res.json()) as { id: string }
  return ch.id
}

/** All roles in the guild. */
export async function listRoles(guildId: string): Promise<DiscordRole[]> {
  return dget<DiscordRole[]>(`/guilds/${guildId}/roles`)
}

/** Create a role (lands below the bot, so the bot can assign it). Returns its id. */
export async function createRole(guildId: string, name: string): Promise<string | null> {
  const res = await dpost(`/guilds/${guildId}/roles`, { name, mentionable: false })
  if (!res.ok) return null
  const role = (await res.json()) as { id: string }
  return role.id
}

/** Give a member a role. Safe no-op if ids are missing. */
export async function assignMemberRole(
  guildId: string,
  userId: string | null | undefined,
  roleId: string | null | undefined
): Promise<boolean> {
  if (!guildId || !userId || !roleId) return false
  const res = await dput(`/guilds/${guildId}/members/${userId}/roles/${roleId}`)
  return res.ok
}

/** Post a message (content and/or embeds) to a channel. Safe no-op without a channel. */
export async function postToChannel(
  channelId: string | null | undefined,
  payload: { content?: string; embeds?: unknown[]; components?: unknown[] }
): Promise<boolean> {
  if (!channelId) return false
  const res = await dpost(`/channels/${channelId}/messages`, payload)
  return res.ok
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

/** Classify a ticket from the buyer's first message: purchase | support | question. */
export function classifyTicket(text: string | null): 'purchase' | 'support' | 'question' {
  if (!text) return 'question'
  const SUPPORT =
    /\b(warranty|banned|suspended|refund|replace|replacement|not working|can'?t (log|access)|locked out|help with my (account|order)|already (bought|purchased|paid)|payout|got flagged|my account (is|got|was))\b/i
  const PURCHASE =
    /\b(buy|buying|purchase|looking for|interested|how much|price|cost|account|acc|\d+\s*k\b|followers?|tts|tiktok shop|order|delivery|usa|uk|preview|available)\b/i
  const REFERRAL = /\b(sent me|referred|recommend(ed)?|promo|discount|coupon|code)\b/i
  const PAYMENT = /(\$\s?\d|btc|crypto|paypal|zelle|cashapp|payment)/i
  if (SUPPORT.test(text) && !PURCHASE.test(text)) return 'support'
  if (PURCHASE.test(text) || REFERRAL.test(text) || PAYMENT.test(text)) return 'purchase'
  return 'question'
}

export type RouteCategory = 'SHOP' | 'BUNDLE' | 'COACH' | 'PARTNER' | 'SUPPORT'

/**
 * Keyword routing category for a ticket (tag-only — refines the CRM tag, does
 * not move or ping channels). Precedence: existing-buyer support first, then
 * partner/coach interest, then bundle vs single-shop purchase.
 */
export function classifyTicketCategory(text: string | null): RouteCategory {
  if (!text) return 'SUPPORT'
  const t = text.toLowerCase()
  const support =
    /\b(warranty|banned|suspended|refund|replace|replacement|not working|can'?t (log|access)|locked out|already (bought|purchased|paid)|payout|got flagged)\b/
  const partner =
    /\b(partner|affiliate|promote|promoter|commission|reseller|resell|work with you|join (your|the) team|become an? (affiliate|partner|promoter))\b/
  const coach = /\b(coach|coaching|mentor|mentorship|course|teach|learn|training|how (do|can) i start|guide me)\b/
  const bundle = /\b(bundle|package|combo|multiple|bulk|\d+\s*(accounts|accs|shops))\b/
  if (support.test(t)) return 'SUPPORT'
  if (partner.test(t)) return 'PARTNER'
  if (coach.test(t)) return 'COACH'
  if (bundle.test(t)) return 'BUNDLE'
  return 'SHOP'
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Match the buyer's message against the KNOWN coach promo codes (the reliable
 * path now that codes are seeded). Longer/most-specific codes win. To avoid a
 * common word like "MAX" or "LEO" falsely crediting a coach, a short letter-only
 * code (< 6 chars, no digit) only counts when it appears next to a referral cue
 * (code / promo / referred / sent me / coach / from).
 */
export function matchKnownPromo(text: string | null, codes: string[]): string | null {
  if (!text || codes.length === 0) return null
  const sorted = [...new Set(codes.filter(Boolean))].sort((a, b) => b.length - a.length)
  const cue = /(code|promo|coupon|discount|referr|sent me|from|coach)/i
  const hasCue = cue.test(text)
  for (const code of sorted) {
    const re = new RegExp(`\\b${escapeRegExp(code)}\\b`, 'i')
    if (!re.test(text)) continue
    const distinctive = /\d/.test(code) || code.length >= 6
    if (distinctive || hasCue) return code.toUpperCase()
  }
  return null
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

/**
 * Post the staff tag panel to the STAFF channel (never the ticket itself, so
 * buyers don't see internal CRM chatter). The ticket channel id is encoded in
 * the button custom_id so the interaction can tag the right lead.
 * No-op if STAFF_CHANNEL_ID is not configured.
 */
export async function postTagButtons(
  ticketChannelId: string,
  buyerUsername: string,
  ticketLink: string
): Promise<void> {
  const staffChannel = process.env.STAFF_CHANNEL_ID
  if (!staffChannel) return
  await dpost(`/channels/${staffChannel}/messages`, {
    embeds: [
      {
        title: 'New ticket → lead',
        description: `**${buyerUsername}** opened a ticket — [open it](${ticketLink})\nClassify so the CRM knows what it is.`,
        color: 0x3b82f6,
      },
    ],
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 3, label: 'Purchase', emoji: { name: '🛒' }, custom_id: `tag:purchase:${ticketChannelId}` },
          { type: 2, style: 2, label: 'Support', emoji: { name: '🛟' }, custom_id: `tag:support:${ticketChannelId}` },
          { type: 2, style: 2, label: 'Question', emoji: { name: '❓' }, custom_id: `tag:question:${ticketChannelId}` },
        ],
      },
    ],
  })
}

const TICKET_TYPE_LABEL: Record<string, string> = {
  purchase: '🛒 Purchase',
  support: '🛟 Support',
  question: '❓ Question',
}

/**
 * Post a plain "new ticket" notice to the STAFF channel. The CRM has already
 * auto-classified the ticket from the buyer's first message, so this is just a
 * heads-up with the detected type and a link, no buttons for staff to press.
 * Staff can still change the type on the deal page if the guess is ever wrong.
 * No-op if STAFF_CHANNEL_ID is not configured.
 */
export async function postTicketNotice(
  buyerUsername: string,
  ticketLink: string,
  ticketType: string | null
): Promise<void> {
  const staffChannel = process.env.STAFF_CHANNEL_ID
  if (!staffChannel) return
  const label = (ticketType && TICKET_TYPE_LABEL[ticketType]) || '❓ Question'
  await dpost(`/channels/${staffChannel}/messages`, {
    embeds: [
      {
        title: 'New ticket → lead',
        description: `**${buyerUsername}** opened a ticket — [open it](${ticketLink})\nAuto-classified as ${label}.`,
        color: 0x3b82f6,
      },
    ],
  })
}
