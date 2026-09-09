import { NextResponse } from 'next/server'
import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { coaches } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

/**
 * Trackable referral link (spec §10, method 1): /ref/<CODE> counts the click on
 * the coach, drops a `ref` cookie, and forwards to the coach's Discord invite.
 * Final sale attribution still happens via the promo code in the ticket.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
): Promise<Response> {
  const { code } = await params
  const coach = await db.query.coaches.findFirst({
    where: eq(coaches.promoCode, decodeURIComponent(code).toUpperCase()),
  })

  if (coach) {
    await db
      .update(coaches)
      .set({ referralClicks: sql`${coaches.referralClicks} + 1` })
      .where(eq(coaches.id, coach.id))
  }

  const dest = coach?.discordInviteLink || coach?.trackingLink || 'https://discord.com'
  const res = NextResponse.redirect(dest)
  if (coach?.promoCode) {
    res.cookies.set('ref', coach.promoCode, { maxAge: 60 * 60 * 24 * 30, path: '/' })
  }
  return res
}
