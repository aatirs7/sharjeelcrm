import Link from 'next/link'
import { desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { customers, riskStatus as riskEnum } from '@/lib/db/schema'
import { formatCents } from '@/lib/money'
import { RiskStatusBadge } from '@/components/status-badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { CustomersFilters } from '@/components/customers/customers-filters'

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ risk?: string }>
}) {
  const { risk } = await searchParams

  const rows = await db.query.customers.findMany({
    where:
      risk && riskEnum.enumValues.includes(risk as never)
        ? eq(customers.riskStatus, risk as (typeof riskEnum.enumValues)[number])
        : undefined,
    orderBy: [desc(customers.totalSpentCents)],
  })

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
        <p className="text-sm text-muted-foreground">{rows.length} shown</p>
      </div>

      <CustomersFilters risk={risk ?? 'all'} />

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Discord</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="text-right">Orders</TableHead>
              <TableHead className="text-right">Total spent</TableHead>
              <TableHead>Last purchase</TableHead>
              <TableHead>Risk</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No customers.
                </TableCell>
              </TableRow>
            )}
            {rows.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">
                  <Link href={`/customers/${c.id}`} className="block hover:underline">
                    {c.discordUsername}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{c.displayName ?? '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{c.totalOrders}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCents(c.totalSpentCents)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {c.lastPurchaseAt ? new Date(c.lastPurchaseAt).toLocaleDateString() : '—'}
                </TableCell>
                <TableCell>
                  <RiskStatusBadge status={c.riskStatus} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
