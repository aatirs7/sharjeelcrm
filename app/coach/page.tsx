import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { coaches, leads, commissions, coachContent } from '@/lib/db/schema'
import { getCurrentCoachId, isAdmin } from '@/lib/auth'
import { getCoachPayouts } from '@/lib/queries/payouts'
import { formatCents } from '@/lib/money'
import { titleCase } from '@/lib/labels'
import { MetricCard } from '@/components/dashboard/metric-card'
import { PageHeader, SectionLabel } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export const dynamic = 'force-dynamic'

function fmtDate(d: string | Date | null) {
  return d ? new Date(d).toLocaleDateString([], { dateStyle: 'medium' }) : '—'
}

export default async function CoachDashboard() {
  const coachId = await getCurrentCoachId()
  // Admins don't have a coach scope — send them to the admin coaches view.
  if (!coachId) {
    if (await isAdmin()) redirect('/coaches')
    redirect('/login')
  }

  const coach = await db.query.coaches.findFirst({ where: eq(coaches.id, coachId!) })
  if (!coach) redirect('/login')

  const [myLeads, ledger, payoutHistory, content] = await Promise.all([
    db.select().from(leads).where(eq(leads.sourceCoachId, coachId!)),
    db.select().from(commissions).where(eq(commissions.coachId, coachId!)),
    getCoachPayouts(coachId!),
    db.select().from(coachContent).where(eq(coachContent.coachId, coachId!)),
  ])

  const ticketsOpened = myLeads.length
  const confirmedBuyers = ledger.filter((c) => c.status === 'approved' || c.status === 'paid').length
  const heldCents = ledger.filter((c) => c.status === 'pending').reduce((s, c) => s + c.amountCents, 0)
  const approvedCents = ledger
    .filter((c) => c.status === 'approved' && c.payoutId == null)
    .reduce((s, c) => s + c.amountCents, 0)
  const paidCents = ledger.filter((c) => c.status === 'paid').reduce((s, c) => s + c.amountCents, 0)

  // Next release = the earliest eligibility among still-held commissions.
  const nextRelease = ledger
    .filter((c) => c.status === 'pending' && c.eligibleAt)
    .map((c) => new Date(c.eligibleAt as Date).getTime())
    .sort((a, b) => a - b)[0]

  return (
    <div className="space-y-8">
      <PageHeader
        marker="coach"
        title={coach.name}
        meta={`${titleCase(coach.tier)} tier${coach.promoCode ? ` · ${coach.promoCode}` : ''}`}
      />

      <div className="space-y-3">
        <SectionLabel>your numbers</SectionLabel>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard label="Tickets attributed" value={ticketsOpened} />
          <MetricCard label="Confirmed buyers" value={confirmedBuyers} sub="commission approved" />
          <MetricCard
            label="Held (7-day)"
            value={formatCents(heldCents)}
            sub={nextRelease ? `next releases ${fmtDate(new Date(nextRelease))}` : 'nothing held'}
          />
          <MetricCard label="Approved (payable)" value={formatCents(approvedCents)} accent="admin" />
          <MetricCard label="Paid to date" value={formatCents(paidCents)} />
          <MetricCard label="Commission rate" value={`${(Number(coach.commissionRate) * 100).toFixed(0)}%`} />
        </div>
      </div>

      <div className="space-y-3">
        <SectionLabel>your links</SectionLabel>
        <Card>
          <CardContent className="space-y-2 py-5 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <span className="text-muted-foreground">Promo code</span>
              <span className="font-mono">{coach.promoCode ?? '—'}</span>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <span className="text-muted-foreground">Tracking link</span>
              <span className="max-w-[70%] truncate font-mono text-xs">{coach.trackingLink ?? '—'}</span>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <span className="text-muted-foreground">Discord invite</span>
              <span className="max-w-[70%] truncate font-mono text-xs">{coach.discordInviteLink ?? '—'}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {content.length > 0 && (
        <div className="space-y-3">
          <SectionLabel>your content</SectionLabel>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Video</TableHead>
                  <TableHead className="text-right">Views</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Buyers</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {content.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="max-w-[160px] truncate">
                      {c.videoLink ? (
                        <a href={c.videoLink} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                          link
                        </a>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{c.views.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.leadsGenerated.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{c.buyers.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <SectionLabel>your payouts</SectionLabel>
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Buyers</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payoutHistory.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    No payouts yet.
                  </TableCell>
                </TableRow>
              )}
              {payoutHistory.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="text-xs text-muted-foreground">
                    {fmtDate(p.periodStart)} – {fmtDate(p.periodEnd)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{p.buyerCount}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{formatCents(p.totalCents)}</TableCell>
                  <TableCell>{titleCase(p.status)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
