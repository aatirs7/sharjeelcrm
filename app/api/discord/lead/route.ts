import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { leads, leadSource } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

/**
 * Phase-2 seam (the Discord bot is a separate future project). When a ticket
 * opens, the bot POSTs here to create a lead. Auth is a shared bearer secret.
 *
 * body: { discordUsername, ticketLink?, discordChannelId?, source? }
 * effect: creates a lead with status new_lead (DB default).
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
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.discordUsername?.trim()) {
    return NextResponse.json({ error: 'discordUsername is required' }, { status: 400 })
  }

  const source = (leadSource.enumValues as readonly string[]).includes(body.source ?? '')
    ? (body.source as (typeof leadSource.enumValues)[number])
    : 'discord'

  const [lead] = await db
    .insert(leads)
    .values({
      discordUsername: body.discordUsername.trim(),
      ticketLink: body.ticketLink?.trim() || null,
      discordChannelId: body.discordChannelId?.trim() || null,
      source,
      // status defaults to new_lead
    })
    .returning({ id: leads.id })

  return NextResponse.json({ ok: true, leadId: lead.id }, { status: 201 })
}
