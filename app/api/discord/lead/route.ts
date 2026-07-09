import { NextResponse } from 'next/server'
import { and, eq, isNotNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { leads, affiliates, leadSource } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

/**
 * Phase-2 seam: the Discord bot POSTs here when a ticket opens (or via backfill).
 * Auth is a shared bearer secret.
 *
 * body: { discordUsername, ticketLink?, discordChannelId?, source?, interest?, referralCode? }
 * effect: idempotent by discordChannelId — creates a lead, or updates the
 * existing lead for that ticket channel. If referralCode matches an affiliate,
 * source is set to 'affiliate'.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const secret = process.env.DISCORD_WEBHOOK_SECRET
  const auth = req.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    discordUsername?: string
    ticketLink?: string
    discordChannelId?: string
    source?: string
    interest?: string
    referralCode?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.discordUsername?.trim()) {
    return NextResponse.json({ error: 'discordUsername is required' }, { status: 400 })
  }

  const referralCode = body.referralCode?.trim() || null
  // A known code implies an affiliate referral.
  let source = (leadSource.enumValues as readonly string[]).includes(body.source ?? '')
    ? (body.source as (typeof leadSource.enumValues)[number])
    : 'discord'
  if (referralCode) {
    const aff = await db.query.affiliates.findFirst({
      where: and(eq(affiliates.referralCode, referralCode), isNotNull(affiliates.referralCode)),
    })
    if (aff) source = 'affiliate'
  }

  const values = {
    discordUsername: body.discordUsername.trim(),
    ticketLink: body.ticketLink?.trim() || null,
    discordChannelId: body.discordChannelId?.trim() || null,
    source,
    referralCode,
    interest: body.interest?.trim() || null,
  }

  // Idempotent per ticket channel: update the existing lead instead of duplicating.
  if (values.discordChannelId) {
    const existing = await db.query.leads.findFirst({
      where: eq(leads.discordChannelId, values.discordChannelId),
    })
    if (existing) {
      await db
        .update(leads)
        .set({
          discordUsername: values.discordUsername,
          ticketLink: values.ticketLink ?? existing.ticketLink,
          referralCode: values.referralCode ?? existing.referralCode,
          interest: values.interest ?? existing.interest,
          source: values.source,
        })
        .where(eq(leads.id, existing.id))
      return NextResponse.json({ ok: true, leadId: existing.id, updated: true })
    }
  }

  const [lead] = await db.insert(leads).values(values).returning({ id: leads.id })
  return NextResponse.json({ ok: true, leadId: lead.id, updated: false }, { status: 201 })
}
