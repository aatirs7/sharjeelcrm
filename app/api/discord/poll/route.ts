import { NextResponse } from 'next/server'
import { eq, isNotNull, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { leads, coaches } from '@/lib/db/schema'
import { ingestTicketLead } from '@/lib/leads-ingest'
import {
  listTicketChannels,
  findBuyer,
  firstBuyerMessage,
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

/**
 * Hourly Vercel Cron: find tickets opened since the last run, create/enrich a
 * lead for each, and post the staff tag buttons. Watermark = the highest ticket
 * channel id we've already turned into a lead (channel ids are time-ordered
 * snowflakes), so each run only handles genuinely new tickets.
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

  // Watermark: max numeric ticket channel id already ingested.
  const [row] = await db
    .select({ m: sql<string | null>`max(${leads.discordChannelId}::bigint)` })
    .from(leads)
    .where(sql`${leads.discordChannelId} ~ '^[0-9]+$'`)
  const watermark = row?.m ? BigInt(row.m) : BigInt(0)

  const channels = await listTicketChannels(guildId)
  const fresh = channels
    .filter((c) => BigInt(c.id) > watermark)
    .sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1)) // oldest first
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

  return NextResponse.json({
    ok: true,
    ranAt: new Date().toISOString(),
    scanned: channels.length,
    newSinceWatermark: fresh.length,
    leadsCreated: created,
    rolesAssigned,
    noBuyer,
    capped: channels.filter((c) => BigInt(c.id) > watermark).length > MAX_PER_RUN,
  })
}

export const GET = handle
export const POST = handle
