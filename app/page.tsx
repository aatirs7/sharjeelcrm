import { getCurrentRep } from '@/lib/auth'
import { getDashboardMetrics, type Period } from '@/lib/queries/dashboard'
import { formatCents } from '@/lib/money'
import { titleCase } from '@/lib/labels'
import { Card, CardContent } from '@/components/ui/card'
import { MetricCard } from '@/components/dashboard/metric-card'
import { PeriodToggle } from '@/components/dashboard/period-toggle'
import { TaskInbox } from '@/components/tasks/task-inbox'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const { period: periodParam } = await searchParams
  const period: Period = periodParam === 'week' ? 'week' : 'month'

  const rep = await getCurrentRep()
  const isAdmin = rep?.role === 'admin'
  const m = await getDashboardMetrics(period)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {rep ? `${rep.displayName ?? rep.email ?? rep.id}` : ''}
            {isAdmin ? ' · admin' : ' · rep'} · {m.rangeLabel.toLowerCase()}
          </p>
        </div>
        <PeriodToggle period={period} />
      </div>

      {/* Revenue / sales */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label={`Revenue (${period})`} value={formatCents(m.revenueCents)} sub={`${m.paidOrders} paid orders`} />
        <MetricCard label="Avg order value" value={formatCents(m.avgOrderValueCents)} />
        <MetricCard
          label="Refunds / chargebacks"
          value={m.refundsCount}
          sub={m.refundsCount ? formatCents(m.refundsCents) : 'none'}
        />
        <MetricCard label="Orders awaiting delivery" value={m.awaitingDelivery} />
        {isAdmin && (
          <>
            <MetricCard
              label="Supplier payout (85%)"
              value={formatCents(m.supplierPayoutCents)}
              accent="admin"
            />
            <MetricCard
              label="Profit (15%)"
              value={formatCents(m.netProfitCents)}
              sub="net of commission"
              accent="admin"
            />
          </>
        )}
      </div>

      {/* Pipeline / support */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label={`New leads (${period})`} value={m.newLeads} />
        <MetricCard
          label="Close rate"
          value={m.closeRatePct == null ? '—' : `${m.closeRatePct}%`}
          sub={m.closeRateBasis}
        />
        <MetricCard
          label="Best lead source"
          value={m.bestLeadSource ? titleCase(m.bestLeadSource) : '—'}
        />
        <MetricCard
          label="Active warranties"
          value={m.activeWarranties}
          sub={m.expiringWarranties ? `${m.expiringWarranties} expiring ≤7d` : 'none expiring'}
        />
        <MetricCard label="Open issues" value={m.openIssues} />
      </div>

      {rep ? (
        <TaskInbox repId={rep.id} />
      ) : (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">Loading…</CardContent>
        </Card>
      )}
    </div>
  )
}
