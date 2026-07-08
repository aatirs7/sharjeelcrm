import Link from 'next/link'
import { notFound } from 'next/navigation'
import { desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { customers, orders } from '@/lib/db/schema'
import { formatCents } from '@/lib/money'
import { warrantyState } from '@/lib/warranty'
import { OrderStatusBadge, WarrantyBadge, RiskStatusBadge } from '@/components/status-badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { CustomerRiskNotes } from '@/components/customers/customer-risk-notes'

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right tabular-nums">{value ?? '—'}</span>
    </div>
  )
}

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const customer = await db.query.customers.findFirst({ where: eq(customers.id, id) })
  if (!customer) notFound()

  const history = await db
    .select()
    .from(orders)
    .where(eq(orders.customerId, id))
    .orderBy(desc(orders.createdAt))

  const activeWarranties = history.filter((o) => {
    const s = warrantyState(o.warrantyEnd)
    return s === 'active' || s === 'expiring'
  }).length

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/customers" className="text-sm text-muted-foreground hover:underline">
          ← Customers
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{customer.discordUsername}</h1>
        <RiskStatusBadge status={customer.riskStatus} />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <Row label="Display name" value={customer.displayName} />
            <Row label="Total orders" value={customer.totalOrders} />
            <Row label="Total spent" value={formatCents(customer.totalSpentCents)} />
            <Row
              label="Last purchase"
              value={customer.lastPurchaseAt ? new Date(customer.lastPurchaseAt).toLocaleDateString() : '—'}
            />
            <Row label="Active warranties" value={activeWarranties} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Risk &amp; notes</CardTitle>
          </CardHeader>
          <CardContent>
            <CustomerRiskNotes
              customerId={customer.id}
              risk={customer.riskStatus}
              notes={customer.notes ?? ''}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Order history</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Package</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Warranty</TableHead>
                <TableHead className="pr-6">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                    No orders.
                  </TableCell>
                </TableRow>
              )}
              {history.map((o) => {
                const wstate = warrantyState(o.warrantyEnd)
                return (
                  <TableRow key={o.id}>
                    <TableCell className="pl-6 font-medium">
                      <Link href={`/orders/${o.id}`} className="hover:underline">
                        {o.package}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCents(o.priceCents)}</TableCell>
                    <TableCell>
                      <OrderStatusBadge status={o.status} />
                    </TableCell>
                    <TableCell>
                      {wstate === 'none' ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <WarrantyBadge state={wstate} />
                      )}
                    </TableCell>
                    <TableCell className="pr-6 text-muted-foreground">
                      {new Date(o.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
