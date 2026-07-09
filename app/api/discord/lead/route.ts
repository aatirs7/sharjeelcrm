import { NextResponse } from 'next/server'
import { ingestTicketLead } from '@/lib/leads-ingest'

export const dynamic = 'force-dynamic'

/**
 * Phase-2 seam: create/update a lead from a Discord ticket (used by tooling;
 * the live flow is the hourly poll). Auth is a shared bearer secret.
 * Idempotent by discordChannelId.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const secret = process.env.DISCORD_WEBHOOK_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Parameters<typeof ingestTicketLead>[0]
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body.discordUsername?.trim()) {
    return NextResponse.json({ error: 'discordUsername is required' }, { status: 400 })
  }

  const { leadId, created } = await ingestTicketLead(body)
  return NextResponse.json({ ok: true, leadId, updated: !created }, { status: created ? 201 : 200 })
}
