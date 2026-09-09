import { desc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { leaderboardMonths } from '@/lib/db/schema'
import { getLeaderboard } from '@/lib/queries/leaderboard'
import { formatCents, TIER_THRESHOLDS } from '@/lib/money'
import { titleCase } from '@/lib/labels'
import { SectionLabel } from '@/components/page-header'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PageHeader } from '@/components/page-header'

export const dynamic = 'force-dynamic'

const TIER_CLASSES: Record<string, string> = {
  gold: 'text-amber-600 dark:text-amber-400',
  silver: 'text-slate-500 dark:text-slate-300',
  bronze: 'text-orange-700 dark:text-orange-400',
}

const MEDAL = ['🥇', '🥈', '🥉']

interface Standing {
  rank: number
  name: string
  buyers: number
  rewardCents: number
}

export default async function LeaderboardPage() {
  const [rows, archive] = await Promise.all([
    getLeaderboard(),
    db.select().from(leaderboardMonths).orderBy(desc(leaderboardMonths.month)).limit(6),
  ])

  return (
    <div className="space-y-5">
      <PageHeader
        marker="leaderboard"
        title="Leaderboard"
        meta="this week · by confirmed buyers"
      />

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead>Coach</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead className="text-right">This week</TableHead>
              <TableHead className="text-right">This month</TableHead>
              <TableHead className="text-right">Revenue driven</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  No coaches yet.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r, i) => (
              <TableRow key={r.coachId}>
                <TableCell className="tabular-nums">{MEDAL[i] ?? i + 1}</TableCell>
                <TableCell className="font-medium">
                  {r.name}
                  {r.promoCode && (
                    <span className="ml-2 font-mono text-xs text-muted-foreground">{r.promoCode}</span>
                  )}
                </TableCell>
                <TableCell className={TIER_CLASSES[r.tier] ?? ''}>{titleCase(r.tier)}</TableCell>
                <TableCell className="text-right tabular-nums font-medium">{r.weeklyBuyers}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{r.monthlyBuyers}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCents(r.revenueCents)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Tiers are assigned from confirmed buyers this month: {TIER_THRESHOLDS.silver}+ = silver,{' '}
        {TIER_THRESHOLDS.gold}+ = gold. Resets and archives monthly. Updated daily.
      </p>

      {archive.length > 0 && (
        <div className="space-y-3 pt-2">
          <SectionLabel>past months</SectionLabel>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {archive.map((m) => {
              const standings = (m.standings as Standing[] | null) ?? []
              return (
                <div key={m.id} className="rounded-xl border bg-card p-4">
                  <div className="mb-2 font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    {m.month}
                  </div>
                  {standings.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No confirmed buyers.</p>
                  ) : (
                    <ol className="space-y-1 text-sm">
                      {standings.slice(0, 3).map((s) => (
                        <li key={s.rank} className="flex items-center justify-between gap-2">
                          <span>
                            {['🥇', '🥈', '🥉'][s.rank - 1]} {s.name}
                            <span className="ml-1 text-muted-foreground">· {s.buyers}</span>
                          </span>
                          {s.rewardCents > 0 && (
                            <span className="font-medium text-emerald-600 dark:text-emerald-400">
                              {formatCents(s.rewardCents)}
                            </span>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
