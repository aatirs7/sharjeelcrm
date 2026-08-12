import { NextResponse } from 'next/server'
import { and, eq, lt, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { orders, tasks } from '@/lib/db/schema'
import { flagExpiringWarranties } from '@/lib/automations'
import { sweepCommissions, assignMonthlyTiers } from '@/lib/commissions'
import { postWeeklyLeaderboard } from '@/lib/discord-posts'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Daily sweep — invoked by Vercel Cron (see vercel.json). Vercel triggers a GET
 * and, when CRON_SECRET is set, sends `Authorization: Bearer <CRON_SECRET>`.
 * We accept GET (Vercel) and POST (manual/spec) via the same handler.
 *
 * Does:
 *  1. Flags expiring warranties (rule 6).
 *  2. Reports orders whose warranty has expired (computed — no status write).
 *  3. Surfaces overdue open tasks (already highlighted on the dashboard).
 *  4. Runs the 7-day commission sweep (approve eligible, cancel refunded/disputed).
 *     This is the single daily home for the sweep — no extra cron (see plan).
 */
async function handle(req: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const flaggedWarranties = await flagExpiringWarranties()
  const commissionSweep = await sweepCommissions()
  const tiersChanged = await assignMonthlyTiers()
  // Post the weekly leaderboard once a week (Mondays) to the affiliates channel.
  const leaderboardPosted = now.getDay() === 1 ? await postWeeklyLeaderboard() : false

  const [expiredRow, overdueRow] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(orders)
      .where(and(eq(orders.deliveryStatus, 'delivered'), lt(orders.warrantyEnd, now))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(tasks)
      .where(and(eq(tasks.status, 'open'), lt(tasks.dueAt, now))),
  ])

  return NextResponse.json({
    ok: true,
    ranAt: now.toISOString(),
    flaggedWarranties,
    expiredWarranties: expiredRow[0]?.n ?? 0,
    overdueTasks: overdueRow[0]?.n ?? 0,
    commissionsApproved: commissionSweep.approved,
    commissionsCancelled: commissionSweep.cancelled,
    tiersChanged,
    leaderboardPosted,
  })
}

export const GET = handle
export const POST = handle
