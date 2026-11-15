import { SectionLabel } from '@/components/page-header'
import { MetricCard } from '@/components/dashboard/metric-card'
import { formatCents } from '@/lib/money'
import type { BlitzTotals } from '@/lib/queries/blitz'

const BLITZ_DASHBOARD = 'https://useblitz.co/commerce'

function ago(d: Date | null): string {
  if (!d) return 'no Blitz sales yet'
  const mins = Math.round((Date.now() - d.getTime()) / 60000)
  if (mins < 60) return `last sale ${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 48) return `last sale ${hrs}h ago`
  return `last sale ${Math.round(hrs / 24)} days ago`
}

/** Card payments through Blitz, from confirmed CRM sales (see lib/queries/blitz.ts). */
export function BlitzBalance({ t }: { t: BlitzTotals }) {
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
        <MetricCard
          label="Collected through Blitz"
          value={formatCents(t.collectedCents)}
          sub={`${t.sales} sales · before Blitz fees`}
          accent="admin"
        />
        <MetricCard label="Today" value={formatCents(t.todayCents)} sub={`${t.todaySales} sales · ${ago(t.lastSaleAt)}`} />
        <MetricCard label="Last 7 days" value={formatCents(t.weekCents)} sub={`${t.weekSales} sales`} />
        <MetricCard
          label="Waiting to pay"
          value={t.waitingCheckouts}
          sub={t.refundedCents ? `${formatCents(t.refundedCents)} refunded` : 'card links sent, not paid yet'}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Gross card sales confirmed through Blitz. Blitz doesn&apos;t share its balance, fees or bank
        withdrawals with other apps, so for the exact amount available to withdraw, open Blitz.
      </p>
    </div>
  )
}
