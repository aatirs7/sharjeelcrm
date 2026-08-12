import { getLeaderboard } from '@/lib/queries/leaderboard'
import { formatCents, TIER_THRESHOLDS } from '@/lib/money'
import { titleCase } from '@/lib/labels'
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

export default async function LeaderboardPage() {
  const rows = await getLeaderboard()

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
        {TIER_THRESHOLDS.gold}+ = gold. Updated daily.
      </p>
    </div>
  )
}
