import Link from 'next/link'
import { eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { leads, orders } from '@/lib/db/schema'
import { getFinanceStats } from '@/lib/queries/finance'
import { listSquarePayments, squareConfigured, type SquarePayment } from '@/lib/square'
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

function fmtWhen(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/**
 * Latest card payments straight from Square (the processor), each linked to
 * the ticket it was recorded on. Square is the live feed; the headline money
 * above comes from CRM orders.
 */
async function getSquareActivity(): Promise<
  | { ok: true; payments: (SquarePayment & { ticket: { id: string; deal: number; user: string | null } | null })[] }
  | { ok: false; error: string }
> {
  if (!squareConfigured()) return { ok: false, error: 'Square is not connected.' }
  try {
    const all = await listSquarePayments(new Date(Date.now() - 14 * 86400_000))
    const recent = all.filter((p) => p.status === 'COMPLETED').reverse().slice(0, 25)
    const ids = recent.map((p) => p.id)
    const linked = ids.length
      ? await db
          .select({ tx: orders.transactionId, id: leads.id, deal: leads.dealNumber, user: leads.discordUsername })
          .from(orders)
          .innerJoin(leads, eq(leads.id, orders.leadId))
          .where(inArray(orders.transactionId, ids))
      : []
    const byTx = new Map(linked.map((l) => [l.tx, { id: l.id, deal: l.deal, user: l.user }]))
    return { ok: true, payments: recent.map((p) => ({ ...p, ticket: byTx.get(p.id) ?? null })) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Square request failed' }
  }
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

  const [f, square] = await Promise.all([
    getFinanceStats(windowStart(period)),
    getSquareActivity(),
  ])
  const maxMethod = Math.max(1, ...f.byMethod.map((m) => m.cents))

  // Headline money comes from CRM orders. Every past Stripe charge was synced
  // into orders, and card-link (Square) and crypto sales are recorded as
  // orders by Mark Paid, so orders are the one complete source now that Stripe
  // is no longer the processor.
  const revenueCents = f.revenueCents
  const paidCount = f.paidCount

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

  return (
    <div className="space-y-10">
      <PageHeader
        marker="revenue"
        title="Revenue"
        meta={`${paidCount} payments · ${windowLabel} · crm`}
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <PeriodToggle period={period} basePath="/revenue" options={PERIOD_OPTIONS} />
          </div>
        }
      />

      {/* FLOW: money earned in the selected window, and where it splits */}
      <section className="space-y-3">
        <SectionLabel>money {windowLabel}</SectionLabel>

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

      {/* Commission owed: current stock, not tied to the window */}
      <section className="space-y-3">
        <SectionLabel>coach commission · right now</SectionLabel>
        <div className="grid gap-3 sm:grid-cols-2">
          <MetricCard
            label="Commission owed"
            value={formatCents(f.commissionOwedCents)}
            sub={`${formatCents(f.commissionPaidCents)} paid · all-time`}
            accent="admin"
          />
        </div>
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

      {/* Square activity (latest, not windowed) */}
      <section className="space-y-3">
        <SectionLabel>card payments · square · last 14 days</SectionLabel>
        {!square.ok ? (
          <Card>
            <CardContent className="py-4 text-sm text-rose-500">{square.error}</CardContent>
          </Card>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Buyer</TableHead>
                  <TableHead>Ticket</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {square.payments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                      No card payments in the last 14 days.
                    </TableCell>
                  </TableRow>
                )}
                {square.payments.map((p) => {
                  const refunded = (p.refunded_money?.amount ?? 0) > 0
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="text-sm">
                        {p.card_details?.card?.cardholder_name ?? p.buyer_email_address ?? p.id.slice(0, 14)}
                        <div className="text-xs text-muted-foreground">
                          {p.buyer_email_address ? `${p.buyer_email_address} · ` : ''}
                          {fmtWhen(p.created_at)}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {p.ticket ? (
                          <Link href={`/tickets/${p.ticket.id}`} className="font-mono text-xs text-primary hover:underline">
                            DEAL-{p.ticket.deal}
                            {p.ticket.user ? ` · @${p.ticket.user}` : ''}
                          </Link>
                        ) : (
                          <span className="text-xs text-amber-500">not linked to a ticket yet</span>
                        )}
                      </TableCell>
                      <TableCell className={cn('text-right tabular-nums', refunded && 'text-muted-foreground line-through')}>
                        {formatCents(p.amount_money.amount)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  )
}
