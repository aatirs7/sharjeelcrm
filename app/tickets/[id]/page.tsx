import Link from 'next/link'
import { notFound } from 'next/navigation'
import { desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { leads, orders, coaches, auditLogs } from '@/lib/db/schema'
import { formatCents } from '@/lib/money'
import { titleCase, paymentMethodLabel } from '@/lib/labels'
import { LeadStatusBadge, OrderStatusBadge } from '@/components/status-badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { LeadStatusChanger } from '@/components/leads/lead-status-changer'
import { LeadNotes } from '@/components/leads/lead-notes'
import { LeadEmail } from '@/components/leads/lead-email'
import { ConvertToOrderDialog } from '@/components/leads/convert-to-order-dialog'
import { ClaimButton } from '@/components/workers/claim-button'

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value ?? '—'}</span>
    </div>
  )
}

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, id),
    with: { assignedRep: true, sourceCoach: true },
  })
  if (!lead) notFound()

  const [linkedOrders, coachList, timeline] = await Promise.all([
    db.select().from(orders).where(eq(orders.leadId, id)).orderBy(desc(orders.createdAt)),
    db.select().from(coaches),
    db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.entityRef, `DEAL-${lead.dealNumber}`))
      .orderBy(desc(auditLogs.createdAt))
      .limit(50),
  ])

  const isWon = lead.status === 'completed'

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-3 border-b border-border/60 pb-6 text-center">
        <Link
          href="/tickets"
          className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
        >
          ← tickets
        </Link>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          DEAL-{lead.dealNumber}
        </p>
        <div className="flex items-center gap-3">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            {lead.discordUsername}
          </h1>
          <LeadStatusBadge status={lead.status} />
        </div>
        {!isWon && (
          <ConvertToOrderDialog
            leadId={lead.id}
            coaches={coachList}
            defaultPackage={lead.interest ?? ''}
            defaultPriceDollars={lead.budgetCents != null ? (lead.budgetCents / 100).toString() : ''}
            defaultMethod={lead.paymentMethod}
          />
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent>
            <Field label="Source" value={titleCase(lead.source)} />
            <Field
              label="Referral code"
              value={
                lead.referralCode ? (
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                    {lead.referralCode}
                  </span>
                ) : (
                  '—'
                )
              }
            />
            <Field
              label="Coach"
              value={
                lead.sourceCoach ? (
                  <span>
                    {lead.sourceCoach.name}
                    {lead.promoCodeUsed ? (
                      <span className="ml-1 font-mono text-xs text-muted-foreground">
                        {lead.promoCodeUsed}
                      </span>
                    ) : null}
                    {lead.promoCodeUsed && lead.sourceCoach.discountCents > 0 ? (
                      <span className="ml-1 text-xs text-muted-foreground">
                        · {formatCents(lead.sourceCoach.discountCents)} off
                      </span>
                    ) : null}
                  </span>
                ) : (
                  <span className="text-muted-foreground">unattributed</span>
                )
              }
            />
            <Field
              label="Route"
              value={
                lead.routeCategory ? (
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                    {lead.routeCategory}
                  </span>
                ) : (
                  '—'
                )
              }
            />
            <Field label="Interest" value={lead.interest} />
            <Field
              label="Budget"
              value={lead.budgetCents != null ? formatCents(lead.budgetCents) : '—'}
            />
            <Field
              label="Ticket"
              value={
                lead.ticketLink ? (
                  <a href={lead.ticketLink} target="_blank" rel="noreferrer" className="underline">
                    open
                  </a>
                ) : (
                  '—'
                )
              }
            />
            <Field
              label="Assigned worker"
              value={
                <span className="flex items-center gap-2">
                  {lead.assignedRep?.displayName ?? lead.assignedRep?.email ?? (
                    <span className="text-muted-foreground">unclaimed</span>
                  )}
                  <ClaimButton leadId={lead.id} assigned={lead.assignedRepId} />
                </span>
              }
            />
            <Field
              label="Payment"
              value={
                lead.paymentMethod ? (
                  <span className="flex flex-col items-end gap-0.5">
                    <span>
                      {paymentMethodLabel(lead.paymentMethod)}
                      {lead.paymentLink ? (
                        <>
                          {' · '}
                          <a href={lead.paymentLink} target="_blank" rel="noreferrer" className="underline">
                            checkout link
                          </a>
                        </>
                      ) : null}
                    </span>
                    {lead.paymentRef ? (
                      <span className="font-mono text-xs text-muted-foreground">{lead.paymentRef}</span>
                    ) : lead.paymentMethod === 'crypto' && lead.status === 'waiting_payment' ? (
                      <span className="text-xs text-muted-foreground">waiting for the transfer</span>
                    ) : null}
                  </span>
                ) : (
                  <span className="text-muted-foreground">not chosen yet</span>
                )
              }
            />
            <Field label="Created" value={new Date(lead.createdAt).toLocaleDateString()} />
            <Separator className="my-3" />
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Email (for Stripe match)</div>
              <LeadEmail leadId={lead.id} email={lead.email ?? ''} />
            </div>
            <Separator className="my-3" />
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Status</div>
              <LeadStatusChanger leadId={lead.id} status={lead.status} />
              {isWon && (
                <p className="text-xs text-muted-foreground">
                  Lead is won — an order has been created.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <LeadNotes leadId={lead.id} notes={lead.notes ?? ''} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Orders</CardTitle>
            </CardHeader>
            <CardContent>
              {linkedOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground">No orders yet.</p>
              ) : (
                <ul className="space-y-2">
                  {linkedOrders.map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-3 text-sm">
                      <Link href={`/orders/${o.id}`} className="hover:underline">
                        {o.package}
                      </Link>
                      <span className="flex items-center gap-2">
                        <span className="tabular-nums">{formatCents(o.priceCents)}</span>
                        <OrderStatusBadge status={o.status} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3">
                {timeline.map((e) => (
                  <li key={e.id} className="flex gap-3 text-sm">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                    <div>
                      <p>{e.summary}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(e.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                        {e.actorRole ? ` · ${e.actorRole}` : ''}
                      </p>
                    </div>
                  </li>
                ))}
                <li className="flex gap-3 text-sm">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                  <div>
                    <p>Deal created</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(lead.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                  </div>
                </li>
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
