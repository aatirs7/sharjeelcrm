import { NextResponse } from 'next/server'
import { and, eq, lt, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { orders, tasks } from '@/lib/db/schema'
import { flagExpiringWarranties } from '@/lib/automations'
import { sweepCommissions, assignMonthlyTiers, finalizePreviousMonth } from '@/lib/commissions'
import { postWeeklyLeaderboard, postDailyReport, postDueVouchRequests } from '@/lib/discord-posts'
import { deleteStaleTicketChannels } from '@/lib/discord'
import { scanFraud } from '@/lib/fraud'
import { assignAchievements } from '@/lib/achievements'
import { syncStripeOrders } from '@/lib/stripe-sync'
import { squareConfigured } from '@/lib/square'
import { syncSquarePayments } from '@/lib/square-payments'

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
  // Keep the CRM's orders/customers in step with real Stripe charges first, so
  // the rest of the sweep (commissions, rollups) sees the latest sales.
  const stripeSync = await syncStripeOrders()
  // Square is the card processor now. The webhook records sales in real time;
  // this catches any it missed in the last 3 days. Isolated so a Square outage
  // never stops the rest of the sweep.
  let squareSync: { checked: number; recorded: number; unmatched: number } | { error: string } = { checked: 0, recorded: 0, unmatched: 0 }
  if (squareConfigured()) {
    try {
      const r = await syncSquarePayments(new Date(Date.now() - 3 * 86400_000), { notifyUnmatched: true })
      squareSync = { checked: r.checked, recorded: r.recorded.length, unmatched: r.unmatched.length }
    } catch (e) {
      squareSync = { error: e instanceof Error ? e.message : 'square sync failed' }
    }
  }
  const flaggedWarranties = await flagExpiringWarranties()
  const commissionSweep = await sweepCommissions()
  const tiersChanged = await assignMonthlyTiers()
  const archivedMonth = await finalizePreviousMonth()
  // Post the weekly leaderboard once a week (Mondays) to the affiliates channel.
  const leaderboardPosted = now.getDay() === 1 ? await postWeeklyLeaderboard() : false
  const fraudFlagged = await scanFraud()
  const achievementsUnlocked = await assignAchievements()
  const dailyReportPosted = await postDailyReport()

  // Prune ticket channels older than the retention window so the guild stays
  // under Discord's ~500-channel cap. Capped per run; drains a backlog gradually.
  const guildId = process.env.GUILD_ID
  const retentionDays = Number(process.env.TICKET_RETENTION_DAYS || '60')
  const ticketCleanup =
    guildId && process.env.BOT_TOKEN
      ? await deleteStaleTicketChannels(guildId, retentionDays)
      : { eligible: 0, deleted: 0 }

  // Send the delayed post-sale review + referral prompt for deals that have come
  // due. Isolated so a Discord failure never aborts the rest of the sweep.
  let vouchRequests = { posted: 0, eligible: 0 }
  try {
    vouchRequests = await postDueVouchRequests()
  } catch {
    vouchRequests = { posted: 0, eligible: 0 }
  }

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
    stripeOrdersCreated: stripeSync.created,
    stripeOrdersUpdated: stripeSync.updated,
    squareSync,
    flaggedWarranties,
    expiredWarranties: expiredRow[0]?.n ?? 0,
    overdueTasks: overdueRow[0]?.n ?? 0,
    commissionsApproved: commissionSweep.approved,
    commissionsCancelled: commissionSweep.cancelled,
    commissionsReversed: commissionSweep.reversed,
    tiersChanged,
    archivedMonth,
    leaderboardPosted,
    fraudFlagged,
    achievementsUnlocked,
    dailyReportPosted,
    ticketChannelsEligible: ticketCleanup.eligible,
    ticketChannelsDeleted: ticketCleanup.deleted,
    vouchRequestsEligible: vouchRequests.eligible,
    vouchRequestsPosted: vouchRequests.posted,
  })
}

export const GET = handle
export const POST = handle
