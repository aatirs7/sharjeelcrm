import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { leads } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

/**
 * The Discord bot calls this when staff tags a ticket (Purchase / Support /
 * Warranty). Purchase leaves the lead in the pipeline; support/warranty marks
 * the lead lost (not a sale) with a note. Idempotent, keyed by ticket channel.
 *
 * body: { discordChannelId, tag: 'purchase' | 'support' | 'warranty' }
 */
export async function POST(req: Request): Promise<NextResponse> {
  const secret = process.env.DISCORD_WEBHOOK_SECRET
  if (req.headers.get('authorization') !== `Bearer ${secret}` || !secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { discordChannelId?: string; tag?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const tag = body.tag
  if (!body.discordChannelId || !['purchase', 'support', 'warranty'].includes(tag ?? '')) {
    return NextResponse.json({ error: 'discordChannelId and valid tag required' }, { status: 400 })
  }

  const lead = await db.query.leads.findFirst({
    where: eq(leads.discordChannelId, body.discordChannelId),
  })
  if (!lead) return NextResponse.json({ error: 'No lead for this channel' }, { status: 404 })

  const note = `[bot] tagged as ${tag}`
  if (tag === 'purchase') {
    // Keep in pipeline; just annotate.
    await db
      .update(leads)
      .set({ notes: lead.notes ? `${lead.notes}\n${note}` : note })
      .where(eq(leads.id, lead.id))
  } else {
    // Support / warranty — not a new sale; drop out of the active pipeline.
    await db
      .update(leads)
      .set({ status: 'lost', notes: lead.notes ? `${lead.notes}\n${note}` : note })
      .where(eq(leads.id, lead.id))
  }

  return NextResponse.json({ ok: true, leadId: lead.id, tag })
}
