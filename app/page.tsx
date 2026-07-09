import { getCurrentRep } from '@/lib/auth'
import { getDashboardMetrics, type Period } from '@/lib/queries/dashboard'
import { getStripeStats } from '@/lib/stripe'
import { formatCents } from '@/lib/money'
import { titleCase } from '@/lib/labels'
import { Card, CardContent } from '@/components/ui/card'
import { MetricCard } from '@/components/dashboard/metric-card'
import { PeriodToggle } from '@/components/dashboard/period-toggle'
import { TaskInbox } from '@/components/tasks/task-inbox'
import { PageHeader, SectionLabel } from '@/components/page-header'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const { period: periodParam } = await searchParams
  const period: Period = periodParam === 'week' ? 'week' : 'month'

  const rep = await getCurrentRep()
  const isAdmin = rep?.role === 'admin'
  const [m, stripe] = await Promise.all([getDashboardMetrics(period), getStripeStats()])

  // Stripe is the source of truth for money.
  const live = stripe.configured && !stripe.error
  const revenueCents = live ? (period === 'week' ? stripe.weekCents : stripe.monthCents) ?? 0 : m.revenueCents
  const payCount = live ? (period === 'week' ? stripe.weekCount : stripe.monthCount) ?? 0 : m.paidOrders
  const aovCents = payCount ? Math.round(revenueCents / payCount) : 0
  const payoutCents = live ? Math.round(revenueCents * 0.85) : m.supplierPayoutCents
  const profitCents = live ? revenueCents - Math.round(revenueCents * 0.85) : m.netProfitCents
  const refundsCount = live ? stripe.refundedCount ?? 0 : m.refundsCount
  const refundsCents = live ? stripe.refundedCents ?? 0 : m.refundsCents

  return (
    <div className="space-y-8">
      <PageHeader
        marker="overview"
        title="Dashboard"
        meta={`${rep ? rep.displayName ?? rep.email ?? rep.id : ''} · ${isAdmin ? 'admin' : 'rep'} · ${m.rangeLabel.toLowerCase()}`}
        action={<PeriodToggle period={period} />}
      />

      {/* Revenue / sales */}
      <div className="space-y-3">
      <SectionLabel>revenue &amp; sales</SectionLabel>
      <div className={`grid gap-3 sm:grid-cols-2 ${isAdmin ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`}>
        <MetricCard label={`Revenue (${period})`} value={formatCents(revenueCents)} sub={`${payCount} payments`} />
        <MetricCard label="Avg order value" value={formatCents(aovCents)} />
        <MetricCard
          label="Refunds / chargebacks"
          value={refundsCount}
          sub={refundsCount ? formatCents(refundsCents) : 'none'}
        />
        <MetricCard label="Orders awaiting delivery" value={m.awaitingDelivery} />
        {isAdmin && (
          <>
            <MetricCard
              label="Supplier payout (85%)"
              value={formatCents(payoutCents)}
              accent="admin"
            />
            <MetricCard
              label="Profit (15%)"
              value={formatCents(profitCents)}
              accent="admin"
            />
          </>
        )}
      </div>
      </div>

      {/* Pipeline / support */}
      <div className="space-y-3">
      <SectionLabel>pipeline &amp; support</SectionLabel>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard label={`New tickets (${period})`} value={m.newLeads} />
        <MetricCard
          label="Close rate"
          value={m.closeRatePct == null ? '—' : `${m.closeRatePct}%`}
          sub={m.closeRateBasis}
        />
        <MetricCard
          label="Top source"
          value={m.bestLeadSource ? titleCase(m.bestLeadSource) : '—'}
        />
        <MetricCard
          label="Active warranties"
          value={m.activeWarranties}
          sub={m.expiringWarranties ? `${m.expiringWarranties} expiring ≤7d` : 'none expiring'}
        />
        <MetricCard label="Open issues" value={m.openIssues} />
        <MetricCard
          label="Overdue tasks"
          value={m.overdueTasks}
          sub={m.overdueTasks ? 'needs attention' : 'all clear'}
        />
      </div>
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
