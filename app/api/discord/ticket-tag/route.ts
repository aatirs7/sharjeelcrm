import { NextResponse } from 'next/server'
import { applyTicketTag, type TicketTag } from '@/lib/ticket-tag'

export const dynamic = 'force-dynamic'

/**
 * Apply a ticket tag from tooling (bearer-authed). The live path is the Discord
 * interactions endpoint (button clicks); this stays for scripts/manual use.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const secret = process.env.DISCORD_WEBHOOK_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  let body: { discordChannelId?: string; tag?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body.discordChannelId || !['purchase', 'support', 'question'].includes(body.tag ?? '')) {
    return NextResponse.json({ error: 'discordChannelId and valid tag required' }, { status: 400 })
  }
  const result = await applyTicketTag(body.discordChannelId, body.tag as TicketTag)
  if (!result.ok) return NextResponse.json({ error: 'No lead for this channel' }, { status: 404 })
  return NextResponse.json({ ok: true, leadId: result.leadId })
}
