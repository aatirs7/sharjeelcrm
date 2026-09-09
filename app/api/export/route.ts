import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { desc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { leads, customers, commissions, payouts, coaches, leaderboardMonths } from '@/lib/db/schema'
import { PIN_COOKIE, parseSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

function csv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((r) =>
      r
        .map((v) => {
          const s = v == null ? '' : String(v)
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
        })
        .join(',')
    )
    .join('\n')
}

const money = (c: number | null | undefined) => ((c ?? 0) / 100).toFixed(2)
const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : '')

/** Admin-only CSV export (spec §44). Types: deals, customers, commissions, payouts. */
export async function GET(req: Request): Promise<NextResponse | Response> {
  const jar = await cookies()
  const session = parseSession(jar.get(PIN_COOKIE)?.value)
  if (session?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const type = new URL(req.url).searchParams.get('type') ?? 'deals'
  let out: (string | number | null)[][] = []

  if (type === 'deals') {
    const rows = await db.select().from(leads).orderBy(desc(leads.createdAt))
    out = [
      ['deal', 'discord', 'status', 'source', 'promo_code', 'email', 'created'],
      ...rows.map((l) => [`DEAL-${l.dealNumber}`, l.discordUsername, l.status, l.source, l.promoCodeUsed ?? l.referralCode, l.email, iso(l.createdAt)]),
    ]
  } else if (type === 'customers') {
    const rows = await db.select().from(customers).orderBy(desc(customers.totalSpentCents))
    out = [
      ['discord', 'orders', 'total_spent', 'risk', 'last_purchase'],
      ...rows.map((c) => [c.discordUsername, c.totalOrders, money(c.totalSpentCents), c.riskStatus, iso(c.lastPurchaseAt)]),
    ]
  } else if (type === 'commissions') {
    const [rows, coachRows] = await Promise.all([
      db.select().from(commissions).orderBy(desc(commissions.createdAt)),
      db.select().from(coaches),
    ])
    const name = new Map(coachRows.map((c) => [c.id, c.name]))
    out = [
      ['coach', 'amount', 'status', 'eligible_at', 'approved_at', 'paid_at', 'reason'],
      ...rows.map((c) => [name.get(c.coachId) ?? c.coachId, money(c.amountCents), c.status, iso(c.eligibleAt), iso(c.approvedAt), iso(c.paidAt), c.cancelReason]),
    ]
  } else if (type === 'payouts') {
    const [rows, coachRows] = await Promise.all([
      db.select().from(payouts).orderBy(desc(payouts.createdAt)),
      db.select().from(coaches),
    ])
    const name = new Map(coachRows.map((c) => [c.id, c.name]))
    out = [
      ['coach', 'buyers', 'total', 'status', 'paid_at', 'method', 'ref'],
      ...rows.map((p) => [name.get(p.coachId) ?? p.coachId, p.buyerCount, money(p.totalCents), p.status, iso(p.paidAt), p.method, p.transactionRef]),
    ]
  } else if (type === 'leaderboard') {
    const rows = await db.select().from(leaderboardMonths).orderBy(desc(leaderboardMonths.month))
    out = [['month', 'rank', 'coach', 'buyers', 'reward']]
    for (const m of rows) {
      const standings = (m.standings as { rank: number; name: string; buyers: number; rewardCents: number }[] | null) ?? []
      for (const s of standings) out.push([m.month, s.rank, s.name, s.buyers, money(s.rewardCents)])
    }
  } else {
    return NextResponse.json({ error: 'Unknown type' }, { status: 400 })
  }

  return new Response(csv(out), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${type}.csv"`,
    },
  })
}
