import { NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { leads } from '@/lib/db/schema'
import { ingestTicketLead } from '@/lib/leads-ingest'
import {
  listTicketChannels,
  findBuyer,
  firstBuyerMessage,
  detectReferralCode,
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

  let created = 0
  let noBuyer = 0
  for (const ch of fresh) {
    const buyer = await findBuyer(ch)
    if (!buyer) {
      noBuyer++
      continue
    }
    const ticketLink = `https://discord.com/channels/${guildId}/${ch.id}`
    const message = await firstBuyerMessage(ch.id, buyer.id)
    const code = detectReferralCode(message)

    await ingestTicketLead({
      discordUsername: buyer.username,
      discordChannelId: ch.id,
      ticketLink,
      interest: message,
      referralCode: code,
      source: code ? 'affiliate' : 'discord',
    })
    await postTagButtons(ch.id, buyer.username)
    created++
  }

  return NextResponse.json({
    ok: true,
    ranAt: new Date().toISOString(),
    scanned: channels.length,
    newSinceWatermark: fresh.length,
    leadsCreated: created,
    noBuyer,
    capped: channels.filter((c) => BigInt(c.id) > watermark).length > MAX_PER_RUN,
  })
}

export const GET = handle
export const POST = handle
