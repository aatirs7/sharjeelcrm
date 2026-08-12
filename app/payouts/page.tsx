import { getPayoutSummary } from '@/lib/queries/payouts'
import { formatCents } from '@/lib/money'
import { titleCase } from '@/lib/labels'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PageHeader, SectionLabel } from '@/components/page-header'
import { PayCoachDialog } from '@/components/payouts/pay-coach-dialog'

export const dynamic = 'force-dynamic'

function fmtDate(d: string | Date | null) {
  return d ? new Date(d).toLocaleDateString([], { dateStyle: 'medium' }) : '—'
}

export default async function PayoutsPage() {
  const { coaches, history } = await getPayoutSummary()
  const totalPayable = coaches.reduce((s, c) => s + c.pendingCents, 0)

  return (
    <div className="space-y-8">
      <PageHeader
        marker="payouts"
        title="Payouts"
        meta={`${formatCents(totalPayable)} payable now`}
      />

      {/* Coaches — approved (payable), held, paid */}
      <div className="space-y-3">
        <SectionLabel>coach balances</SectionLabel>
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Coach</TableHead>
                <TableHead className="text-right">Held (in 7d hold)</TableHead>
                <TableHead className="text-right">Approved (payable)</TableHead>
                <TableHead className="text-right">Paid to date</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {coaches.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    No coaches yet.
                  </TableCell>
                </TableRow>
              )}
              {coaches.map((c) => (
                <TableRow key={c.coachId}>
                  <TableCell className="font-medium">
                    {c.name}
                    {c.promoCode && (
                      <span className="ml-2 font-mono text-xs text-muted-foreground">{c.promoCode}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {c.heldCount ? `${formatCents(c.heldCents)} · ${c.heldCount}` : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {c.pendingCount ? `${formatCents(c.pendingCents)} · ${c.pendingCount}` : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatCents(c.paidCents)}
                  </TableCell>
                  <TableCell className="text-right">
                    <PayCoachDialog
                      coachId={c.coachId}
                      coachName={c.name}
                      amountCents={c.pendingCents}
                      count={c.pendingCount}
                      defaultMethod={c.payoutMethod}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="text-center text-xs text-muted-foreground">
          Commissions approve automatically 7 days after payment (the daily sweep), unless the
          charge is refunded or disputed.
        </p>
      </div>

      {/* Payout history */}
      <div className="space-y-3">
        <SectionLabel>payout history</SectionLabel>
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Coach</TableHead>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Buyers</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Method</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    No payouts yet.
                  </TableCell>
                </TableRow>
              )}
              {history.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.coachName}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {fmtDate(p.periodStart)} – {fmtDate(p.periodEnd)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{p.buyerCount}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{formatCents(p.totalCents)}</TableCell>
                  <TableCell>{titleCase(p.status)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {p.method ?? '—'}
                    {p.transactionRef ? ` · ${p.transactionRef}` : ''}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
