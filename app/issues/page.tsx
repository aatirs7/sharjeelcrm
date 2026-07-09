import Link from 'next/link'
import { desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { issues, replacementStatus as replEnum } from '@/lib/db/schema'
import { titleCase } from '@/lib/labels'
import { cn } from '@/lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { IssuesFilters } from '@/components/issues/issues-filters'
import { IssueActions } from '@/components/issues/issue-actions'
import { PageHeader } from '@/components/page-header'

export const dynamic = 'force-dynamic'

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<{ replacement?: string; open?: string }>
}) {
  const { replacement } = await searchParams

  const rows = await db.query.issues.findMany({
    where:
      replacement && replEnum.enumValues.includes(replacement as never)
        ? eq(issues.replacementStatus, replacement as (typeof replEnum.enumValues)[number])
        : undefined,
    orderBy: [desc(issues.openedAt)],
    with: { order: { with: { customer: true } } },
  })

  return (
    <div className="space-y-5">
      <PageHeader marker="issues" title="Issues" meta={`${rows.length} shown`} />

      <IssuesFilters replacement={replacement ?? 'all'} />

      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Opened</TableHead>
              <TableHead>In warranty</TableHead>
              <TableHead>Replacement</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No issues match these filters.
                </TableCell>
              </TableRow>
            )}
            {rows.map((iss) => (
              <TableRow key={iss.id} className={cn(iss.resolvedAt && 'opacity-60')}>
                <TableCell className="font-medium">
                  <Link href={`/orders/${iss.orderId}`} className="hover:underline">
                    {iss.order?.package}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {iss.order?.customer?.discordUsername}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {iss.issueType ? titleCase(iss.issueType) : '—'}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {new Date(iss.openedAt).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-sm">
                  {iss.warrantyValidAtOpen == null ? (
                    '—'
                  ) : iss.warrantyValidAtOpen ? (
                    <span className="text-emerald-600 dark:text-emerald-400">Valid</span>
                  ) : (
                    <span className="text-rose-600 dark:text-rose-400">Expired</span>
                  )}
                </TableCell>
                <TableCell>
                  {iss.resolvedAt ? (
                    <span className="text-emerald-600 dark:text-emerald-400 text-sm">Resolved</span>
                  ) : (
                    titleCase(iss.replacementStatus)
                  )}
                </TableCell>
                <TableCell>
                  <IssueActions
                    issueId={iss.id}
                    replacementStatus={iss.replacementStatus}
                    resolved={!!iss.resolvedAt}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
