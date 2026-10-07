import Link from 'next/link'
import { isNotNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { leads } from '@/lib/db/schema'
import { getFinanceStats } from '@/lib/queries/finance'
import { getStripeStats } from '@/lib/stripe'
import {
  formatCents,
  splitRevenue,
  SUPPLIER_PCT,
  SERVICE_PCT,
  PROFIT_PCT,
  SUPPLIER_SHARE,
  SERVICE_SHARE,
  PROFIT_SHARE,
} from '@/lib/money'
import { titleCase } from '@/lib/labels'
import { cn } from '@/lib/utils'
import { MetricCard } from '@/components/dashboard/metric-card'
import { PeriodToggle } from '@/components/dashboard/period-toggle'
import { PageHeader, SectionLabel } from '@/components/page-header'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { SyncStripeButton } from '@/components/revenue/sync-button'

export const dynamic = 'force-dynamic'

type Period = 'all' | 'month' | 'week'

const PERIOD_OPTIONS = [
  { value: 'all', label: 'all-time' },
  { value: 'month', label: 'month' },
  { value: 'week', label: 'week' },
]

/** Window start that matches how Stripe's month/week figures are bucketed. */
function windowStart(period: Period): Date | null {
  if (period === 'all') return null
  const now = new Date()
  if (period === 'week') {
    const d = new Date(now)
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)) // Monday = 0
    return d
  }
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

const WINDOW_LABEL: Record<Period, string> = {
  all: 'all-time',
  month: 'this month',
  week: 'this week',
}

function fmtDate(unix: number) {
  return new Date(unix * 1000).toLocaleDateString([], { dateStyle: 'medium' })
}

export default async function RevenuePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const { period: periodParam } = await searchParams
  const period: Period =
    periodParam === 'week' ? 'week' : periodParam === 'month' ? 'month' : 'all'
  const windowLabel = WINDOW_LABEL[period]

  const [f, stripe] = await Promise.all([
    getFinanceStats(windowStart(period)),
    getStripeStats(),
  ])
  const maxMethod = Math.max(1, ...f.byMethod.map((m) => m.cents))

  // When Stripe is connected, the headline money tracks real Stripe money and
  // the 55/10/35 split is derived from it. Otherwise fall back to CRM orders.
  const live = stripe.configured && !stripe.error
  const revenueCents = live
    ? (period === 'week' ? stripe.weekCents : period === 'month' ? stripe.monthCents : stripe.grossCents) ?? 0
    : f.revenueCents
  const paidCount = live
    ? (period === 'week' ? stripe.weekCount : period === 'month' ? stripe.monthCount : stripe.paidCount) ?? 0
    : f.paidCount

  const split = splitRevenue(revenueCents)
  const supplierPayoutCents = split.supplierPayoutCents
  const serviceFeeCents = split.serviceFeeCents
  const grossProfitCents = split.profitCents
  const commissionCents = f.commissionCents // order-level, windowed
  const netProfitCents = grossProfitCents - commissionCents
  // Refunds come from synced orders (which carry Stripe's refund state) so they
  // follow the selected window like every other flow on this page.
  const refundsCount = f.refundsCount
  const refundsCents = f.refundsCents

  const segments = [
    { key: 'supplier', label: `Supplier ${SUPPLIER_PCT}`, cents: supplierPayoutCents, pct: SUPPLIER_SHARE * 100, bar: 'bg-muted-foreground/40', dot: 'bg-muted-foreground/60' },
    { key: 'service', label: `Service ${SERVICE_PCT}`, cents: serviceFeeCents, pct: SERVICE_SHARE * 100, bar: 'bg-sky-500/50', dot: 'bg-sky-500' },
    { key: 'profit', label: `Profit ${PROFIT_PCT}`, cents: grossProfitCents, pct: PROFIT_SHARE * 100, bar: 'bg-primary/60', dot: 'bg-primary' },
  ]

  // Match recent Stripe charges to tickets by email.
  const emailLeads = live
    ? await db
        .select({ id: leads.id, discordUsername: leads.discordUsername, email: leads.email })
        .from(leads)
        .where(isNotNull(leads.email))
    : []
  const leadByEmail = new Map(
    emailLeads.filter((l) => l.email).map((l) => [l.email!.toLowerCase(), l])
  )

  return (
    <div className="space-y-10">
      <PageHeader
        marker="revenue"
        title="Revenue"
        meta={`${paidCount} payments · ${windowLabel}${live ? ` · stripe ${stripe.mode}` : ' · crm'}`}
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <PeriodToggle period={period} basePath="/revenue" options={PERIOD_OPTIONS} />
            <SyncStripeButton />
          </div>
        }
      />

      {/* FLOW: money earned in the selected window, and where it splits */}
      <section className="space-y-3">
        <SectionLabel>money {windowLabel}{live ? ' · live from stripe' : ''}</SectionLabel>

        <Card>
          <CardContent className="space-y-6 py-6">
            {/* Headline revenue for the window */}
            <div className="text-center">
              <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                Revenue · {windowLabel}
              </div>
              <div className="mt-2 font-heading text-[2.6rem] leading-none font-semibold tabular-nums">
                {formatCents(revenueCents)}
              </div>
              <div className="mt-2 font-mono text-[11px] text-muted-foreground">
                {paidCount} payments
              </div>
            </div>

            {/* Where that revenue goes: the 55 / 10 / 35 split as one bar */}
            <div className="space-y-3">
              <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                <span>where it goes</span>
                <span>of {formatCents(revenueCents)}</span>
              </div>
              <div className="flex h-3 w-full overflow-hidden rounded-full">
                {segments.map((s) => (
                  <div key={s.key} className={cn('h-full', s.bar)} style={{ width: `${s.pct}%` }} />
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {segments.map((s) => (
                  <div key={s.key} className="flex items-center gap-2.5">
                    <span className={cn('size-2.5 shrink-0 rounded-full', s.dot)} />
                    <div className="min-w-0">
                      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                        {s.label}
                      </div>
                      <div className="text-lg font-semibold tabular-nums">{formatCents(s.cents)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Profit math for the window: gross profit − commission = net */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label={`Gross profit (${PROFIT_PCT})`}
            value={formatCents(grossProfitCents)}
            sub={windowLabel}
            accent="admin"
          />
          <MetricCard
            label="Affiliate commissions"
            value={`- ${formatCents(commissionCents)}`}
            sub={`${windowLabel} · from attributed sales`}
          />
          <MetricCard
            label="Net profit"
            value={formatCents(netProfitCents)}
            sub={`${windowLabel} · after commission`}
            accent="admin"
          />
          <MetricCard
            label="Refunds / chargebacks"
            value={refundsCount}
            sub={refundsCount ? `${formatCents(refundsCents)} · ${windowLabel}` : `none ${windowLabel}`}
          />
        </div>
      </section>

      {/* BALANCES: current stocks, not tied to the window */}
      <section className="space-y-3">
        <SectionLabel>balances · right now</SectionLabel>
        {!stripe.configured ? (
          <Card>
            <CardContent className="py-5 text-sm text-muted-foreground">
              Stripe is not connected, so live balances are unavailable. Add a{' '}
              <span className="font-mono">secret</span> or read-only{' '}
              <span className="font-mono">restricted</span> key as{' '}
              <span className="font-mono">STRIPE_SECRET_KEY</span>.
            </CardContent>
          </Card>
        ) : stripe.error ? (
          <Card>
            <CardContent className="py-4 text-sm text-rose-500">Stripe error: {stripe.error}</CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Available to withdraw"
              value={formatCents(stripe.availableCents ?? 0)}
              sub={stripe.currency ?? 'in stripe'}
              accent="admin"
            />
            <MetricCard
              label="Incoming"
              value={formatCents(stripe.pendingCents ?? 0)}
              sub="not yet settled"
            />
            <MetricCard
              label="Already withdrawn"
              value={formatCents(stripe.withdrawnCents ?? 0)}
              sub={
                stripe.payoutsInTransitCents
                  ? `${formatCents(stripe.payoutsInTransitCents)} in transit`
                  : 'paid to bank'
              }
            />
            <MetricCard
              label="Commission owed"
              value={formatCents(f.commissionOwedCents)}
              sub={`${formatCents(f.commissionPaidCents)} paid · all-time`}
            />
          </div>
        )}
      </section>

      {/* Payment mix for the window */}
      <section className="space-y-3">
        <SectionLabel>payment mix · {windowLabel}</SectionLabel>
        <Card>
          <CardContent className="space-y-3 py-5">
            {f.byMethod.length === 0 && (
              <p className="text-sm text-muted-foreground">No paid orders {windowLabel}.</p>
            )}
            {f.byMethod.map((m) => (
              <div key={m.method} className="flex items-center gap-3">
                <span className="w-24 shrink-0 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  {titleCase(m.method)}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.round((m.cents / maxMethod) * 100)}%` }}
                  />
                </div>
                <span className="w-24 shrink-0 text-right text-sm tabular-nums">{formatCents(m.cents)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      {/* Affiliates (running totals, all-time) */}
      <section className="space-y-3">
        <SectionLabel>affiliates · all-time</SectionLabel>
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Affiliate</TableHead>
                <TableHead>Code</TableHead>
                <TableHead className="text-right">Sales</TableHead>
                <TableHead className="text-right">Revenue driven</TableHead>
                <TableHead className="text-right">Owed</TableHead>
                <TableHead className="text-right">Paid</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {f.affiliates.filter((a) => a.sales > 0).length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    No affiliate sales yet.
                  </TableCell>
                </TableRow>
              )}
              {f.affiliates
                .filter((a) => a.sales > 0)
                .map((a) => (
                  <TableRow key={a.name}>
                    <TableCell className="font-medium">{a.name}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {a.code ? <span className="rounded bg-muted px-1.5 py-0.5">{a.code}</span> : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{a.sales}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCents(a.revenueCents)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{formatCents(a.owedCents)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{formatCents(a.paidCents)}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* Stripe activity (latest, not windowed) */}
      {live && (
        <section className="space-y-3">
          <SectionLabel>stripe activity · latest</SectionLabel>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="overflow-hidden rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Recent charge</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(stripe.charges ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                        No charges.
                      </TableCell>
                    </TableRow>
                  )}
                  {(stripe.charges ?? []).map((c) => {
                    const match = c.email ? leadByEmail.get(c.email.toLowerCase()) : null
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="text-sm">
                          {c.name ?? c.email ?? c.id.slice(0, 14)}
                          <div className="text-xs text-muted-foreground">
                            {c.email ? `${c.email} · ` : ''}
                            {fmtDate(c.created)}
                          </div>
                          {match ? (
                            <Link
                              href={`/tickets/${match.id}`}
                              className="text-xs font-mono text-primary hover:underline"
                            >
                              → @{match.discordUsername}
                            </Link>
                          ) : (
                            <span className="text-xs text-muted-foreground">unlinked</span>
                          )}
                        </TableCell>
                        <TableCell className={cn('text-sm', c.status === 'succeeded' ? 'text-emerald-500' : 'text-muted-foreground')}>
                          {c.status}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatCents(c.amountCents)}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="overflow-hidden rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Payout</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(stripe.payouts ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                        No payouts.
                      </TableCell>
                    </TableRow>
                  )}
                  {(stripe.payouts ?? []).map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-sm">
                        {p.id.slice(0, 16)}
                        <div className="text-xs text-muted-foreground">arrives {fmtDate(p.arrival)}</div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{p.status}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCents(p.amountCents)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
