import { getAnalytics, type Bar } from '@/lib/queries/analytics'
import { formatCents } from '@/lib/money'
import { MetricCard } from '@/components/dashboard/metric-card'
import { PageHeader, SectionLabel } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

function BarList({ bars, money = true }: { bars: Bar[]; money?: boolean }) {
  const max = Math.max(1, ...bars.map((b) => b.value))
  if (bars.length === 0) return <p className="text-sm text-muted-foreground">No data yet.</p>
  return (
    <div className="space-y-2.5">
      {bars.map((b) => (
        <div key={b.label} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate font-medium capitalize">{b.label}</span>
            <span className="shrink-0 tabular-nums">
              {money ? formatCents(b.value) : b.value}
              {b.sub && <span className="ml-2 text-xs text-muted-foreground">{b.sub}</span>}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((b.value / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function RevenueChart({ data }: { data: { day: string; cents: number }[] }) {
  const w = 720
  const h = 120
  const max = Math.max(1, ...data.map((d) => d.cents))
  const step = data.length > 1 ? w / (data.length - 1) : w
  const pts = data.map((d, i) => [i * step, h - (d.cents / max) * (h - 12) - 4] as const)
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `0,${h} ${line} ${w},${h}`
  const total = data.reduce((s, d) => s + d.cents, 0)
  return (
    <Card>
      <CardContent className="space-y-2 py-5">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">Last 30 days</span>
          <span className="font-mono text-sm">{formatCents(total)}</span>
        </div>
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" role="img" aria-label="Revenue over the last 30 days">
            <polygon points={area} fill="var(--primary)" opacity="0.12" />
            <polyline points={line} fill="none" stroke="var(--primary)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
      </CardContent>
    </Card>
  )
}

export default async function AnalyticsPage() {
  const a = await getAnalytics()

  return (
    <div className="space-y-8">
      <PageHeader marker="analytics" title="Analytics" meta="performance breakdowns" />

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Avg order value" value={formatCents(a.avgOrderValueCents)} />
        <MetricCard label="Refund rate" value={`${a.refundRatePct}%`} />
        <MetricCard label="Repeat customer rate" value={`${a.repeatCustomerRatePct}%`} />
      </div>

      <div className="space-y-3">
        <SectionLabel>revenue over time</SectionLabel>
        <RevenueChart data={a.revenueByDay} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <SectionLabel>sales by product</SectionLabel>
          <Card>
            <CardContent className="py-5">
              <BarList bars={a.salesByProduct} />
            </CardContent>
          </Card>
        </div>
        <div className="space-y-3">
          <SectionLabel>sales by worker</SectionLabel>
          <Card>
            <CardContent className="py-5">
              <BarList bars={a.salesByWorker} />
            </CardContent>
          </Card>
        </div>
        <div className="space-y-3">
          <SectionLabel>revenue by coach</SectionLabel>
          <Card>
            <CardContent className="py-5">
              <BarList bars={a.revenueByCoach} />
            </CardContent>
          </Card>
        </div>
        <div className="space-y-3">
          <SectionLabel>lost-deal reasons</SectionLabel>
          <Card>
            <CardContent className="py-5">
              <BarList bars={a.lostReasons} money={false} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
