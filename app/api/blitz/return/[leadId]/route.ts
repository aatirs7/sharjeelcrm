import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { leads } from '@/lib/db/schema'
import { confirmBlitzForLead } from '@/lib/blitz-payments'

export const dynamic = 'force-dynamic'

/**
 * Where Blitz sends a ticket buyer after checkout (Blitz appends ?order=...).
 * Landing here proves nothing, so this only triggers the real check: the
 * stored order for this lead must be PAID at the exact amount (see
 * lib/blitz-payments.ts). Then the buyer goes back to their Discord ticket.
 */
export async function GET(_req: Request, ctx: RouteContext<'/api/blitz/return/[leadId]'>): Promise<NextResponse> {
  const { leadId } = await ctx.params
  const fallback = 'https://discord.com/channels/@me'
  if (!/^[0-9a-f-]{36}$/i.test(leadId)) return NextResponse.redirect(fallback)

  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, leadId),
    columns: { id: true, ticketLink: true, discordChannelId: true },
  })
  if (!lead) return NextResponse.redirect(fallback)

  try {
    const r = await confirmBlitzForLead(lead.id)
    console.log('[blitz return]', lead.id, r.kind)
  } catch (e) {
    // The webhook and the hourly sweep check again, so the buyer is never stuck.
    console.error('[blitz return] check failed:', e)
  }

  const guildId = process.env.GUILD_ID
  const ticket =
    lead.ticketLink ??
    (lead.discordChannelId && guildId ? `https://discord.com/channels/${guildId}/${lead.discordChannelId}` : null)
  return NextResponse.redirect(ticket ?? fallback)
}
