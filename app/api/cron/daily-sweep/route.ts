import { NextResponse } from 'next/server'
import { and, eq, lt, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { orders, tasks } from '@/lib/db/schema'
import { flagExpiringWarranties } from '@/lib/automations'

export const dynamic = 'force-dynamic'

/**
 * Daily sweep — invoked by Vercel Cron (see vercel.json). Vercel triggers a GET
 * and, when CRON_SECRET is set, sends `Authorization: Bearer <CRON_SECRET>`.
 * We accept GET (Vercel) and POST (manual/spec) via the same handler.
 *
 * Does three things per spec:
 *  1. Flags expiring warranties (rule 6).
 *  2. Reports orders whose warranty has expired (computed — no status write).
 *  3. Surfaces overdue open tasks (already highlighted on the dashboard).
 */
async function handle(req: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const flaggedWarranties = await flagExpiringWarranties()

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
  })
}

export const GET = handle
export const POST = handle
