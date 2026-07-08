import Link from 'next/link'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { leads, reps, leadStatus as leadStatusEnum } from '@/lib/db/schema'
import { formatCents } from '@/lib/money'
import { titleCase } from '@/lib/labels'
import { LeadStatusBadge } from '@/components/status-badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { LeadsFilters } from '@/components/leads/leads-filters'
import { LeadQuickAdd } from '@/components/leads/lead-quick-add'

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; rep?: string }>
}) {
  const { status, rep } = await searchParams

  const conditions = []
  if (status && leadStatusEnum.enumValues.includes(status as never)) {
    conditions.push(eq(leads.status, status as (typeof leadStatusEnum.enumValues)[number]))
  }
  if (rep) conditions.push(eq(leads.assignedRepId, rep))

  const [rows, repList] = await Promise.all([
    db.query.leads.findMany({
      where: conditions.length ? and(...conditions) : undefined,
      orderBy: [desc(leads.createdAt)],
      with: { assignedRep: true },
    }),
    db.select().from(reps),
  ])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground">{rows.length} shown</p>
        </div>
        <LeadQuickAdd reps={repList} />
      </div>

      <LeadsFilters reps={repList} status={status ?? 'all'} rep={rep ?? 'all'} />

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Discord</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Interest</TableHead>
              <TableHead className="text-right">Budget</TableHead>
              <TableHead>Assigned</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No leads match these filters.
                </TableCell>
              </TableRow>
            )}
            {rows.map((lead) => (
              <TableRow key={lead.id} className="cursor-pointer">
                <TableCell className="font-medium">
                  <Link href={`/leads/${lead.id}`} className="block hover:underline">
                    {lead.discordUsername}
                  </Link>
                </TableCell>
                <TableCell>
                  <Link href={`/leads/${lead.id}`} className="block">
                    <LeadStatusBadge status={lead.status} />
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{titleCase(lead.source)}</TableCell>
                <TableCell className="text-muted-foreground">{lead.interest ?? '—'}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {lead.budgetCents != null ? formatCents(lead.budgetCents) : '—'}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {lead.assignedRep?.displayName ?? lead.assignedRep?.email ?? '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
