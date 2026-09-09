import { NextResponse } from 'next/server'
import { and, desc, eq, gte, isNotNull, isNull, lt } from 'drizzle-orm'
import { db } from '@/lib/db'
import { leads, coaches } from '@/lib/db/schema'
import { ingestTicketLead } from '@/lib/leads-ingest'
import { postAdminNotify } from '@/lib/discord-posts'
import { applyReferralCode } from '@/lib/referral-code'
import {
  listTicketChannels,
  findBuyer,
  firstBuyerMessage,
  buyerMessages,
  detectReferralCode,
  matchKnownPromo,
  classifyTicket,
  classifyTicketCategory,
  assignMemberRole,
  postTagButtons,
} from '@/lib/discord'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_PER_RUN = 15

// How long after a ticket opens we keep scanning it for a typed referral code.
const CODE_SCAN_HOURS = 48
const CODE_SCAN_MAX = 25

/**
 * Hourly Vercel Cron: find open ticket channels that don't have a lead yet,
 * create/enrich a lead for each, and post the staff tag buttons. Then re-read
 * recent panel tickets (those are ingested the instant they open, before the
 * buyer has typed anything) so a referral code typed into the chat still counts.
 *
 * Vercel Cron sends GET with `Authorization: Bearer <CRON_SECRET>`.
 */
async function handle(req: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const guildId = process.env.GUILD_ID
  if (!process.env.BOT_TOKEN || !guildId) {
    return NextResponse.json({ error: 'BOT_TOKEN / GUILD_ID not configured' }, { status: 500 })
  }

  // Every ticket channel we already turned into a lead (panel tickets are
  // ingested the moment they open, so a plain id watermark would skip any older
  // Ticket Tool ticket that hadn't been polled yet).
  const knownRows = await db
    .select({ id: leads.discordChannelId })
    .from(leads)
    .where(isNotNull(leads.discordChannelId))
  const known = new Set(knownRows.map((r) => r.id!))

  const channels = await listTicketChannels(guildId)
  const fresh = channels
    .filter((c) => !known.has(c.id))
    .sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? 1 : -1)) // newest first, so a stuck one can't starve new tickets
    .slice(0, MAX_PER_RUN)

  // Known coach promo codes drive attribution (reliable match beats the regex).
  const promoRows = await db
    .select({ promoCode: coaches.promoCode })
    .from(coaches)
    .where(isNotNull(coaches.promoCode))
  const promoCodes = promoRows.map((r) => r.promoCode!).filter(Boolean)

  let created = 0
  let noBuyer = 0
  let rolesAssigned = 0
  for (const ch of fresh) {
    const buyer = await findBuyer(ch)
    if (!buyer) {
      noBuyer++
      continue
    }
    const ticketLink = `https://discord.com/channels/${guildId}/${ch.id}`
    const message = await firstBuyerMessage(ch.id, buyer.id)
    const code = matchKnownPromo(message, promoCodes) ?? detectReferralCode(message)
    const email = message?.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/)?.[0] ?? null

    const result = await ingestTicketLead({
      discordUsername: buyer.username,
      discordUserId: buyer.id,
      discordChannelId: ch.id,
      ticketLink,
      interest: message,
      referralCode: code,
      source: code ? 'affiliate' : 'discord',
      ticketType: classifyTicket(message),
      routeCategory: classifyTicketCategory(message),
      email,
    })

    // If the ticket is attributed to a coach, give the buyer that coach's lead role.
    if (result.sourceCoachId) {
      const coach = await db.query.coaches.findFirst({ where: eq(coaches.id, result.sourceCoachId) })
      if (coach?.leadRole && (await assignMemberRole(guildId, buyer.id, coach.leadRole))) {
        rolesAssigned++
      }
    }

    await postTagButtons(ch.id, buyer.username, ticketLink)
    created++
  }

  // Referral-code catch-up: recent tickets with no code yet — read the buyer's
  // messages and apply the first code found (known coach codes win). The
  // "Enter referral code" button in the ticket is instant; this covers buyers
  // who just type the code into the chat instead.
  const scanCutoff = new Date(Date.now() - CODE_SCAN_HOURS * 3_600_000)
  const pending = await db
    .select()
    .from(leads)
    .where(
      and(
        isNotNull(leads.discordChannelId),
        isNotNull(leads.discordUserId),
        isNull(leads.referralCode),
        gte(leads.createdAt, scanCutoff)
      )
    )
    .orderBy(desc(leads.createdAt))
    .limit(CODE_SCAN_MAX)
  let codesApplied = 0
  let scanned = 0
  for (const l of pending) {
    const msgs = await buyerMessages(l.discordChannelId!, l.discordUserId!)
    if (msgs.length === 0) continue
    scanned++
    if (!l.interest) {
      await db.update(leads).set({ interest: msgs[0] }).where(eq(leads.id, l.id))
    }
    // A known coach code counts anywhere; the loose pattern only counts in a
    // short reply (like "AA10") or next to a cue word, to avoid false positives.
    const cue = /(code|promo|coupon|discount|referr|sent me)/i
    const code =
      matchKnownPromo(msgs.join('\n'), promoCodes) ??
      msgs.filter((m) => m.length <= 24 || cue.test(m)).map(detectReferralCode).find(Boolean) ??
      null
    if (!code) continue
    await applyReferralCode(l, code, guildId)
    codesApplied++
  }

  // SLA: alert on tickets still unclaimed with no response after 2 hours (§36).
  const slaHours = Number(process.env.SLA_HOURS || '2')
  const cutoff = new Date(Date.now() - slaHours * 3_600_000)
  const stale = await db
    .select()
    .from(leads)
    .where(
      and(
        eq(leads.status, 'new_lead'),
        isNull(leads.assignedRepId),
        isNull(leads.firstResponseAt),
        eq(leads.slaAlerted, false),
        lt(leads.createdAt, cutoff)
      )
    )
    .limit(10)
  for (const l of stale) {
    await postAdminNotify(
      '⏰ Ticket waiting',
      [`Deal: DEAL-${l.dealNumber}`, `Customer: ${l.discordUsername}`, `Unclaimed for ${slaHours}h+`],
      0xf59e0b
    )
    await db.update(leads).set({ slaAlerted: true }).where(eq(leads.id, l.id))
  }

  return NextResponse.json({
    ok: true,
    ranAt: new Date().toISOString(),
    scanned: channels.length,
    newTickets: fresh.length,
    leadsCreated: created,
    rolesAssigned,
    codesScanned: scanned,
    codesApplied,
    slaAlerts: stale.length,
    noBuyer,
    capped: channels.filter((c) => !known.has(c.id)).length > MAX_PER_RUN,
  })
}

export const GET = handle
export const POST = handle
