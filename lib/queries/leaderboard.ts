import { db } from '../db'
import { coaches, commissions } from '../db/schema'

export interface LeaderboardRow {
  coachId: string
  name: string
  promoCode: string | null
  tier: string
  weeklyBuyers: number
  monthlyBuyers: number
  revenueCents: number
}

function weekStart(now: Date): number {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((now.getDay() + 6) % 7)) // Monday
  return d.getTime()
}

/**
 * Weekly ranking by confirmed buyers. A confirmed buyer is a commission that
 * reached approved/paid (dated by approval). Read-only — tier is assigned by the
 * daily sweep (assignMonthlyTiers), not here.
 */
export async function getLeaderboard(): Promise<LeaderboardRow[]> {
  const now = new Date()
  const wStart = weekStart(now)
  const mStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()

  const [coachRows, ledger] = await Promise.all([
    db.select().from(coaches),
    db.select().from(commissions),
  ])

  const confirmed = ledger.filter(
    (c) => (c.status === 'approved' || c.status === 'paid') && c.approvedAt
  )

  const rows: LeaderboardRow[] = coachRows.map((c) => {
    const mine = confirmed.filter((x) => x.coachId === c.id)
    const weekly = mine.filter((x) => new Date(x.approvedAt as Date).getTime() >= wStart).length
    const monthly = mine.filter((x) => new Date(x.approvedAt as Date).getTime() >= mStart).length
    return {
      coachId: c.id,
      name: c.name,
      promoCode: c.promoCode,
      tier: c.tier,
      weeklyBuyers: weekly,
      monthlyBuyers: monthly,
      revenueCents: c.revenueCents,
    }
  })

  rows.sort(
    (a, b) =>
      b.weeklyBuyers - a.weeklyBuyers ||
      b.monthlyBuyers - a.monthlyBuyers ||
      b.revenueCents - a.revenueCents
  )
  return rows
}
