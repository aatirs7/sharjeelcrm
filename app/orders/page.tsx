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
import { PageHeader } from '@/components/page-header'

function shortDay(d: Date) {
  return d.toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' })
}

/** Where the post-sale vouch + referral DM stands for an order. */
function vouchLabel(o: { vouchDueAt: Date | null; vouchPostedAt: Date | null }): { text: string; tone: string } {
  if (o.vouchPostedAt) return { text: `Sent ${shortDay(o.vouchPostedAt)}`, tone: 'text-emerald-500' }
  if (o.vouchDueAt) return { text: `Goes out ${shortDay(o.vouchDueAt)}`, tone: 'text-amber-500' }
  return { text: '—', tone: 'text-muted-foreground' }
}

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
    <div className="space-y-5">
      <PageHeader marker="orders" title="Orders" meta={`${rows.length} shown`} />

      <OrdersFilters status={status ?? 'all'} payment={payment ?? 'all'} delivery={delivery ?? 'all'} />

      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Package</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Delivery</TableHead>
              <TableHead>Warranty</TableHead>
              <TableHead>Vouch DM</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  No orders match these filters.
                </TableCell>
              </TableRow>
            )}
            {rows.map((o) => {
              const wstate = warrantyState(o.warrantyEnd)
              const vouch = vouchLabel(o)
              return (
                <TableRow key={o.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {shortDay(o.paidAt ?? o.createdAt)}
                  </TableCell>
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
                  <TableCell className={`whitespace-nowrap text-sm ${vouch.tone}`}>{vouch.text}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
