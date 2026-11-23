import { SectionLabel } from '@/components/page-header'
import { MetricCard } from '@/components/dashboard/metric-card'
import { formatCents } from '@/lib/money'
import type { BlitzBalance as Balance, BlitzTotals } from '@/lib/queries/blitz'
import {
  BlitzFeeDialog,
  MatchBalanceDialog,
  RecordWithdrawalDialog,
  RemoveLedgerEntryButton,
} from '@/components/dashboard/blitz-ledger-forms'

const BLITZ_DASHBOARD = 'https://useblitz.co/commerce'

function ago(d: Date | null): string {
  if (!d) return 'no Blitz sales yet'
  const mins = Math.round((Date.now() - d.getTime()) / 60000)
  if (mins < 60) return `last sale ${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 48) return `last sale ${hrs}h ago`
  return `last sale ${Math.round(hrs / 24)} days ago`
}

function day(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })
}

function balanceSub(b: Balance): string {
  if (!b.lastCheck) return b.feeBps ? 'after fees · not matched to Blitz yet' : 'before fees · not matched to Blitz yet'
  const since = `matched to Blitz ${day(b.lastCheck.occurredAt)}`
  if (b.salesSinceCheckCents > 0 && !b.feeBps) return `${since} · new sales before fees`
  return since
}

/**
 * Blitz card money. Sales come in automatically from confirmed Blitz orders;
 * withdrawals and balance checks are recorded here, because Blitz can't be
 * asked for its balance (see getBlitzBalance in lib/queries/blitz.ts).
 */
export function BlitzBalance({ t, b }: { t: BlitzTotals; b: Balance | null }) {
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <SectionLabel>blitz · card payments</SectionLabel>
        <a
          href={BLITZ_DASHBOARD}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground"
        >
          open blitz ↗
        </a>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {b && (
          <MetricCard
            label={b.estimated ? 'Blitz balance (est.)' : 'Blitz balance'}
            value={formatCents(b.balanceCents)}
            sub={balanceSub(b)}
            accent="admin"
          />
        )}
        {b && (
          <MetricCard
            label="Withdrawn"
            value={formatCents(b.withdrawnTotalCents)}
            sub={
              b.lastWithdrawal
                ? `last ${formatCents(b.lastWithdrawal.amountCents)} on ${day(b.lastWithdrawal.occurredAt)}`
                : 'no withdrawals recorded'
            }
          />
        )}
        <MetricCard
          label="Collected through Blitz"
          value={formatCents(t.collectedCents)}
          sub={`${t.sales} sales · today ${formatCents(t.todayCents)} · ${ago(t.lastSaleAt)}`}
        />
        <MetricCard
          label="Waiting to pay"
          value={t.waitingCheckouts}
          sub={t.refundedCents ? `${formatCents(t.refundedCents)} refunded` : 'card links sent, not paid yet'}
        />
      </div>

      {b && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <RecordWithdrawalDialog />
          <MatchBalanceDialog />
          <BlitzFeeDialog bps={b.feeBps} />
        </div>
      )}

      {b && b.recent.length > 0 && (
        <ul className="mx-auto max-w-xl divide-y rounded-xl border bg-card text-sm">
          {b.recent.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2">
              <span className="text-muted-foreground">
                {day(e.occurredAt)} · {e.kind === 'withdrawal' ? 'Withdrawal' : 'Matched to Blitz'}
                {e.note ? ` · ${e.note}` : ''}
              </span>
              <span className="flex items-center gap-3">
                <span className="tabular-nums">
                  {e.kind === 'withdrawal' ? `−${formatCents(e.amountCents)}` : formatCents(e.amountCents)}
                </span>
                <RemoveLedgerEntryButton id={e.id} />
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="text-center text-xs text-muted-foreground">
        New Blitz sales add to the balance automatically. Record each withdrawal here so it comes
        off. Every so often, match it to the number Blitz shows to correct for fees.
      </p>
    </div>
  )
}
