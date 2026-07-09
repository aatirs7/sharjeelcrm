import Link from 'next/link'
import { and, desc, eq, ilike } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  leads,
  reps,
  leadStatus as leadStatusEnum,
  ticketType as ticketTypeEnum,
} from '@/lib/db/schema'
import { LeadStatusBadge, TicketTypeBadge } from '@/components/status-badge'
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
import { TicketTypeTabs } from '@/components/tickets/type-tabs'
import { PageHeader } from '@/components/page-header'

function fmtCreated(d: Date | string) {
  return new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; rep?: string; code?: string; type?: string }>
}) {
  const { status, rep, code, type } = await searchParams

  const conditions = []
  if (status && leadStatusEnum.enumValues.includes(status as never)) {
    conditions.push(eq(leads.status, status as (typeof leadStatusEnum.enumValues)[number]))
  }
  if (type && ticketTypeEnum.enumValues.includes(type as never)) {
    conditions.push(eq(leads.ticketType, type as (typeof ticketTypeEnum.enumValues)[number]))
  }
  if (rep) conditions.push(eq(leads.assignedRepId, rep))
  if (code) conditions.push(ilike(leads.referralCode, `%${code}%`))

  const [rows, repList] = await Promise.all([
    db.query.leads.findMany({
      where: conditions.length ? and(...conditions) : undefined,
      orderBy: [desc(leads.createdAt)],
      with: { assignedRep: true },
    }),
    db.select().from(reps),
  ])

  return (
    <div className="space-y-5">
      <PageHeader
        marker="tickets"
        title="Tickets"
        meta={`${rows.length} shown`}
        action={<LeadQuickAdd reps={repList} />}
      />

      <div className="flex justify-center">
        <TicketTypeTabs type={type ?? 'all'} />
      </div>

      <LeadsFilters reps={repList} status={status ?? 'all'} rep={rep ?? 'all'} code={code ?? ''} />

      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Discord</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Interest</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  No tickets match these filters.
                </TableCell>
              </TableRow>
            )}
            {rows.map((lead) => (
              <TableRow key={lead.id} className="cursor-pointer">
                <TableCell className="font-medium">
                  <Link href={`/tickets/${lead.id}`} className="block hover:underline">
                    {lead.discordUsername}
                  </Link>
                </TableCell>
                <TableCell>
                  {lead.ticketType ? (
                    <TicketTypeBadge type={lead.ticketType} />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <Link href={`/tickets/${lead.id}`} className="block">
                    <LeadStatusBadge status={lead.status} />
                  </Link>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {lead.referralCode ? (
                    <span className="rounded bg-muted px-1.5 py-0.5">{lead.referralCode}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="max-w-[180px] truncate text-xs text-muted-foreground">
                  {lead.email ?? <span className="text-muted-foreground/50">—</span>}
                </TableCell>
                <TableCell className="max-w-[240px] truncate text-muted-foreground">
                  {lead.interest ?? '—'}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                  {fmtCreated(lead.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
