import Link from 'next/link'
import { isNotNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { leads } from '@/lib/db/schema'
import { getFinanceStats } from '@/lib/queries/finance'
import { getStripeStats } from '@/lib/stripe'
import { formatCents, splitRevenue, SUPPLIER_PCT, SERVICE_PCT, PROFIT_PCT } from '@/lib/money'
import { titleCase } from '@/lib/labels'
import { cn } from '@/lib/utils'
import { MetricCard } from '@/components/dashboard/metric-card'
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

function fmtDate(unix: number) {
  return new Date(unix * 1000).toLocaleDateString([], { dateStyle: 'medium' })
}

export default async function RevenuePage() {
  const [f, stripe] = await Promise.all([getFinanceStats(), getStripeStats()])
  const maxMethod = Math.max(1, ...f.byMethod.map((m) => m.cents))

  // When Stripe is connected, the money figures track real Stripe money;
  // the 55/10/35 split is derived from it. Otherwise fall back to CRM orders.
  const live = stripe.configured && !stripe.error
  const revenueCents = live ? stripe.grossCents ?? 0 : f.revenueCents
  const monthCents = live ? stripe.monthCents ?? 0 : f.revenueThisMonthCents
  const paidCount = live ? stripe.paidCount ?? 0 : f.paidCount
  const split = splitRevenue(revenueCents)
  const supplierPayoutCents = split.supplierPayoutCents
  const serviceFeeCents = split.serviceFeeCents
  const grossProfitCents = split.profitCents
  const commissionCents = f.commissionCents
  const netProfitCents = grossProfitCents - commissionCents
  const refundsCount = live ? stripe.refundedCount ?? 0 : f.refundsCount
  const refundsCents = live ? stripe.refundedCents ?? 0 : f.refundsCents

  // Match Stripe charges to tickets by email.
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
    <div className="space-y-8">
      <PageHeader
        marker="revenue"
        title="Revenue"
        meta={`${paidCount} payments · ${live ? `stripe ${stripe.mode}` : 'crm'}`}
      />

      {/* Money */}
      <div className="space-y-3">
        <SectionLabel>money{live ? ' · live from stripe' : ''}</SectionLabel>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Revenue (all-time)" value={formatCents(revenueCents)} sub={`${paidCount} payments`} />
          <MetricCard label="Revenue (this month)" value={formatCents(monthCents)} />
          <MetricCard label="Net profit" value={formatCents(netProfitCents)} sub="after commission" accent="admin" />
          <MetricCard label={`Gross profit (${PROFIT_PCT})`} value={formatCents(grossProfitCents)} accent="admin" />
          <MetricCard label={`Supplier payouts (${SUPPLIER_PCT})`} value={formatCents(supplierPayoutCents)} />
          <MetricCard label={`Service (${SERVICE_PCT})`} value={formatCents(serviceFeeCents)} />
          <MetricCard label="Affiliate commissions" value={formatCents(commissionCents)} />
          <MetricCard label="Commission owed" value={formatCents(f.commissionOwedCents)} sub={`${formatCents(f.commissionPaidCents)} paid`} />
          <MetricCard
            label="Refunds / chargebacks"
            value={refundsCount}
            sub={refundsCount ? formatCents(refundsCents) : 'none'}
          />
        </div>
      </div>

      {/* Payment methods */}
      <div className="space-y-3">
        <SectionLabel>revenue by payment method</SectionLabel>
        <Card>
          <CardContent className="space-y-3 py-5">
            {f.byMethod.length === 0 && (
              <p className="text-sm text-muted-foreground">No paid orders yet.</p>
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
      </div>

      {/* Affiliate commissions */}
      <div className="space-y-3">
        <SectionLabel>affiliate commissions</SectionLabel>
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
              {f.affiliates.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    No affiliates yet.
                  </TableCell>
                </TableRow>
              )}
              {f.affiliates.map((a) => (
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
      </div>

      {/* Stripe live */}
      <div className="space-y-3">
        <SectionLabel>
          stripe{stripe.configured && stripe.mode ? ` · ${stripe.mode}` : ''}
        </SectionLabel>
        {!stripe.configured ? (
          <Card>
            <CardContent className="py-5 text-sm text-muted-foreground">
              Not connected. Add a Stripe <span className="font-mono">secret</span> or read-only{' '}
              <span className="font-mono">restricted</span> key as{' '}
              <span className="font-mono">STRIPE_SECRET_KEY</span> to show live balance, payments,
              and payouts. (The current <span className="font-mono">pk_live</span> publishable key
              can&apos;t read account data.)
            </CardContent>
          </Card>
        ) : stripe.error ? (
          <Card>
            <CardContent className="py-5 text-sm text-rose-500">
              Stripe error: {stripe.error}
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                label="Already withdrawn"
                value={formatCents(stripe.withdrawnCents ?? 0)}
                sub={
                  stripe.payoutsInTransitCents
                    ? `${formatCents(stripe.payoutsInTransitCents)} in transit`
                    : 'paid out to bank'
                }
              />
              <MetricCard
                label="Available to withdraw"
                value={formatCents(stripe.availableCents ?? 0)}
                sub={stripe.currency}
                accent="admin"
              />
              <MetricCard
                label="Incoming"
                value={formatCents(stripe.pendingCents ?? 0)}
                sub="not yet settled"
              />
              <MetricCard label="Volume (30d)" value={formatCents(stripe.volume30dCents ?? 0)} />
            </div>
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
          </>
        )}
      </div>
    </div>
  )
}
