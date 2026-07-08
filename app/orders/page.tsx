import Link from 'next/link'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  orders,
  orderStatus as orderStatusEnum,
  paymentStatus as paymentStatusEnum,
  deliveryStatus as deliveryStatusEnum,
} from '@/lib/db/schema'
import { formatCents } from '@/lib/money'
import { titleCase } from '@/lib/labels'
import { warrantyState } from '@/lib/warranty'
import { OrderStatusBadge, WarrantyBadge } from '@/components/status-badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { OrdersFilters } from '@/components/orders/orders-filters'

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; payment?: string; delivery?: string }>
}) {
  const { status, payment, delivery } = await searchParams

  const conditions = []
  if (status && orderStatusEnum.enumValues.includes(status as never))
    conditions.push(eq(orders.status, status as (typeof orderStatusEnum.enumValues)[number]))
  if (payment && paymentStatusEnum.enumValues.includes(payment as never))
    conditions.push(eq(orders.paymentStatus, payment as (typeof paymentStatusEnum.enumValues)[number]))
  if (delivery && deliveryStatusEnum.enumValues.includes(delivery as never))
    conditions.push(eq(orders.deliveryStatus, delivery as (typeof deliveryStatusEnum.enumValues)[number]))

  const rows = await db.query.orders.findMany({
    where: conditions.length ? and(...conditions) : undefined,
    orderBy: [desc(orders.createdAt)],
    with: { customer: true },
  })

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
        <p className="text-sm text-muted-foreground">{rows.length} shown</p>
      </div>

      <OrdersFilters status={status ?? 'all'} payment={payment ?? 'all'} delivery={delivery ?? 'all'} />

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Package</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Delivery</TableHead>
              <TableHead>Warranty</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  No orders match these filters.
                </TableCell>
              </TableRow>
            )}
            {rows.map((o) => {
              const wstate = warrantyState(o.warrantyEnd)
              return (
                <TableRow key={o.id}>
                  <TableCell className="font-medium">
                    <Link href={`/orders/${o.id}`} className="block hover:underline">
                      {o.package}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {o.customer?.discordUsername ?? '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatCents(o.priceCents)}</TableCell>
                  <TableCell className="text-muted-foreground">{titleCase(o.paymentStatus)}</TableCell>
                  <TableCell>
                    <OrderStatusBadge status={o.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{titleCase(o.deliveryStatus)}</TableCell>
                  <TableCell>{wstate === 'none' ? <span className="text-muted-foreground">—</span> : <WarrantyBadge state={wstate} />}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
