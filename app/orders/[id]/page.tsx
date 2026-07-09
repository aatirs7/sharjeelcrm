import Link from 'next/link'
import { notFound } from 'next/navigation'
import { desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { orders, issues } from '@/lib/db/schema'
import { isAdmin } from '@/lib/auth'
import { formatCents } from '@/lib/money'
import { titleCase } from '@/lib/labels'
import { warrantyState, daysUntil } from '@/lib/warranty'
import { OrderStatusBadge, WarrantyBadge } from '@/components/status-badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { OrderPaymentForm } from '@/components/orders/order-payment-form'
import { MarkDeliveredButton } from '@/components/orders/mark-delivered-button'
import { OrderProofForm } from '@/components/orders/order-proof-form'
import { BuyerConfirmToggle } from '@/components/orders/buyer-confirm-toggle'
import { OrderStatusChanger } from '@/components/orders/order-status-changer'
import { ReportIssueDialog } from '@/components/issues/report-issue-dialog'

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right tabular-nums">{value ?? '—'}</span>
    </div>
  )
}

function fmtDate(d: Date | string | null | undefined) {
  return d ? new Date(d).toLocaleDateString() : '—'
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const order = await db.query.orders.findFirst({
    where: eq(orders.id, id),
    with: { customer: true, affiliate: true, lead: true },
  })
  if (!order) notFound()

  const [orderIssues, admin] = await Promise.all([
    db.select().from(issues).where(eq(issues.orderId, id)).orderBy(desc(issues.openedAt)),
    isAdmin(),
  ])

  const wstate = warrantyState(order.warrantyEnd)
  const isDelivered = order.deliveryStatus === 'delivered'

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-3 border-b border-border/60 pb-6 text-center">
        <Link
          href="/orders"
          className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
        >
          ← orders
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">{order.package}</h1>
          <OrderStatusBadge status={order.status} />
        </div>
      </div>

      <div className="flex flex-wrap justify-center gap-4 text-sm text-muted-foreground">
        <span>
          Customer:{' '}
          <Link href={`/customers/${order.customerId}`} className="text-foreground hover:underline">
            {order.customer?.discordUsername}
          </Link>
        </span>
        {order.affiliate && <span>Affiliate: {order.affiliate.name}</span>}
        {order.lead && (
          <span>
            Origin lead:{' '}
            <Link href={`/leads/${order.leadId}`} className="text-foreground hover:underline">
              {order.lead.discordUsername}
            </Link>
          </span>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {admin && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Financials</CardTitle>
            </CardHeader>
            <CardContent>
              <Row label="Price" value={formatCents(order.priceCents)} />
              <Row label="Supplier payout (85%)" value={formatCents(order.supplierPayoutCents)} />
              <Row label="Profit (15%)" value={formatCents(order.profitCents)} />
              <Row label="Commission" value={formatCents(order.commissionCents)} />
              <Row label="Net profit" value={formatCents(order.netProfitCents ?? 0)} />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Row label="Paid at" value={fmtDate(order.paidAt)} />
            <OrderPaymentForm
              orderId={order.id}
              paymentMethod={order.paymentMethod}
              paymentStatus={order.paymentStatus}
              transactionId={order.transactionId ?? ''}
              paymentLink={order.paymentLink ?? ''}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Fulfillment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Row label="Delivery status" value={titleCase(order.deliveryStatus)} />
            <Row label="Delivered at" value={fmtDate(order.deliveredAt)} />
            {!isDelivered && <MarkDeliveredButton orderId={order.id} />}
            <OrderProofForm orderId={order.id} proofUrl={order.deliveryProofUrl ?? ''} />
            <BuyerConfirmToggle
              orderId={order.id}
              confirmed={order.buyerConfirmed}
              confirmedAt={order.buyerConfirmedAt}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Warranty</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between py-1.5 text-sm">
              <span className="text-muted-foreground">State</span>
              {wstate === 'none' ? (
                <span className="text-muted-foreground">Not delivered</span>
              ) : (
                <span className="flex items-center gap-2">
                  <WarrantyBadge state={wstate} />
                  {wstate !== 'expired' && (
                    <span className="text-xs text-muted-foreground">
                      {daysUntil(order.warrantyEnd)}d left
                    </span>
                  )}
                </span>
              )}
            </div>
            <Row label="Warranty days" value={order.warrantyDays} />
            <Row label="Start" value={fmtDate(order.warrantyStart)} />
            <Row label="End" value={fmtDate(order.warrantyEnd)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <OrderStatusChanger orderId={order.id} status={order.status} />
            <p className="mt-2 text-xs text-muted-foreground">
              Use “Mark delivered” in Fulfillment to move to delivered (sets warranty).
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Issues</CardTitle>
            <ReportIssueDialog orderId={order.id} />
          </CardHeader>
          <CardContent>
            {orderIssues.length === 0 ? (
              <p className="text-sm text-muted-foreground">No issues.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {orderIssues.map((iss) => (
                  <li key={iss.id} className="flex items-center justify-between gap-3">
                    <Link href="/issues" className="hover:underline">
                      {iss.issueType ? titleCase(iss.issueType) : 'Issue'}
                    </Link>
                    <span className="text-muted-foreground">
                      {iss.resolvedAt ? 'resolved' : titleCase(iss.replacementStatus)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
