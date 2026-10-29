import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { leads } from '@/lib/db/schema'
import { inArray } from 'drizzle-orm'
import { checkSquareConnection, getSquareCustomer, getSquareOrderReference, getSquarePayment, listSquarePayments } from '@/lib/square'
import { alreadyRecorded, matchStaticPayment, recordForLead, syncSquarePayments } from '@/lib/square-payments'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authorized(req: Request): boolean {
  const secret = process.env.SQUARE_OPS_SECRET
  const header = req.headers.get('authorization') ?? ''
  if (!secret) return false
  const a = Buffer.from(header)
  const b = Buffer.from(`Bearer ${secret}`)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Ops endpoint for the Square integration (Bearer SQUARE_OPS_SECRET):
 *   ?mode=check                 token + location work
 *   ?mode=preview&since=DATE    what a sync would record, without writing
 *   ?mode=sync&since=DATE       record completed payments (backfill / catch-up)
 *   ?mode=assign&payment=ID&deal=N  record one completed payment on a given ticket
 */
export async function GET(req: Request): Promise<NextResponse> {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const mode = url.searchParams.get('mode') ?? 'check'
  const sinceRaw = url.searchParams.get('since')
  const since = sinceRaw && /^\d{4}-\d{2}-\d{2}$/.test(sinceRaw) ? new Date(`${sinceRaw}T00:00:00Z`) : new Date(Date.now() - 3 * 86400_000)

  if (mode === 'check') return NextResponse.json(await checkSquareConnection())

  if (mode === 'preview') {
    const payments = await listSquarePayments(since)
    const rows = []
    for (const p of payments) {
      const ref = p.order_id ? await getSquareOrderReference(p.order_id).catch(() => null) : null
      const refLead = ref ? await db.query.leads.findFirst({ where: eq(leads.id, ref), columns: { dealNumber: true } }) : null
      const stat = !refLead && p.status === 'COMPLETED' ? await matchStaticPayment(p) : null
      rows.push({
        id: p.id,
        status: p.status,
        amountCents: p.amount_money.amount,
        refundedCents: p.refunded_money?.amount ?? 0,
        createdAt: p.created_at,
        email: p.buyer_email_address ?? null,
        alreadyRecorded: await alreadyRecorded(p.id),
        ticket: refLead ? `DEAL-${refLead.dealNumber} (from its own link)` : stat?.leadId ? `DEAL-${stat.candidates[0]} (only match)` : null,
        candidates: stat?.candidates ?? [],
        payer: {
          cardholder: p.card_details?.card?.cardholder_name ?? null,
          billingName: [p.billing_address?.first_name, p.billing_address?.last_name].filter(Boolean).join(' ') || null,
          card: p.card_details?.card ? `${p.card_details.card.card_brand ?? ''} ${p.card_details.card.last_4 ?? ''}`.trim() : null,
          customer: p.customer_id ? await getSquareCustomer(p.customer_id).catch(() => null) : null,
        },
        candidateTickets: stat?.candidates?.length
          ? (
              await db
                .select({ deal: leads.dealNumber, user: leads.discordUsername, email: leads.email, created: leads.createdAt, updated: leads.updatedAt })
                .from(leads)
                .where(inArray(leads.dealNumber, stat.candidates))
            ).map((l) => ({ deal: l.deal, user: l.user, email: l.email, opened: l.created, linkSentOrLastUpdate: l.updated }))
          : [],
      })
    }
    return NextResponse.json({ since: since.toISOString(), count: rows.length, payments: rows })
  }

  if (mode === 'assign') {
    const paymentId = url.searchParams.get('payment') ?? ''
    const deal = Number(url.searchParams.get('deal'))
    if (!paymentId || !Number.isInteger(deal)) return NextResponse.json({ error: 'payment and deal required' }, { status: 400 })
    const payment = await getSquarePayment(paymentId)
    if (payment.status !== 'COMPLETED') return NextResponse.json({ error: `payment is ${payment.status}` }, { status: 409 })
    if (await alreadyRecorded(payment.id)) return NextResponse.json({ result: 'already' })
    const lead = await db.query.leads.findFirst({ where: eq(leads.dealNumber, deal), columns: { id: true } })
    if (!lead) return NextResponse.json({ error: `DEAL-${deal} not found` }, { status: 404 })
    return NextResponse.json(await recordForLead(lead.id, payment))
  }

  if (mode === 'sync') {
    return NextResponse.json(await syncSquarePayments(since, { notifyUnmatched: true }))
  }
  return NextResponse.json({ error: 'unknown mode' }, { status: 400 })
}
