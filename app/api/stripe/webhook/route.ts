import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { leads } from '@/lib/db/schema'
import { verifyStripeWebhook } from '@/lib/stripe'
import { postToChannel } from '@/lib/discord'
import { postAdminNotify } from '@/lib/discord-posts'
import { logAudit } from '@/lib/audit'
import { formatCents } from '@/lib/money'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Stripe → CRM. When a buyer finishes the Checkout link the bot posted in their
 * ticket, Stripe calls this with `checkout.session.completed`; the deal moves
 * to `payment_received`, the buyer is told in the ticket, and staff are
 * notified. Configure the endpoint in the Stripe dashboard and put its signing
 * secret in STRIPE_WEBHOOK_SECRET. Staff can still press "Mark Paid" by hand.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) return new NextResponse('STRIPE_WEBHOOK_SECRET not configured', { status: 503 })

  const raw = await req.text()
  if (!verifyStripeWebhook(raw, req.headers.get('stripe-signature'), secret)) {
    return new NextResponse('invalid signature', { status: 400 })
  }

  const event = JSON.parse(raw) as {
    type: string
    data?: {
      object?: {
        id?: string
        payment_status?: string
        amount_total?: number | null
        payment_intent?: string | null
        client_reference_id?: string | null
        metadata?: Record<string, string>
        customer_details?: { email?: string | null } | null
      }
    }
  }

  if (event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.async_payment_succeeded') {
    return NextResponse.json({ received: true, ignored: event.type })
  }
  const session = event.data?.object
  if (!session?.id || session.payment_status !== 'paid') {
    return NextResponse.json({ received: true, ignored: 'not paid' })
  }

  const leadId = session.metadata?.leadId || session.client_reference_id || null
  const lead = leadId
    ? await db.query.leads.findFirst({ where: eq(leads.id, leadId) })
    : await db.query.leads.findFirst({ where: eq(leads.stripeSessionId, session.id) })
  if (!lead) return NextResponse.json({ received: true, ignored: 'no deal' })

  // Idempotent: Stripe retries, and staff may have marked it paid already.
  const alreadyPaid = ['payment_received', 'fulfillment', 'completed'].includes(lead.status)
  const patch: Partial<typeof leads.$inferInsert> = {
    paymentMethod: 'card',
    paymentRef: session.payment_intent ?? lead.paymentRef ?? session.id,
    stripeSessionId: session.id,
  }
  const buyerEmail = session.customer_details?.email?.trim().toLowerCase()
  if (buyerEmail && !lead.email) patch.email = buyerEmail // links the charge to the ticket
  if (!alreadyPaid) patch.status = 'payment_received'
  await db.update(leads).set(patch).where(eq(leads.id, lead.id))

  if (!alreadyPaid) {
    const amount = session.amount_total != null ? formatCents(session.amount_total) : null
    await logAudit(
      {
        action: 'deal.status',
        entity: 'deal',
        entityRef: `DEAL-${lead.dealNumber}`,
        summary: `Card payment received via Stripe${amount ? ` (${amount})` : ''}`,
        meta: { from: lead.status, to: 'payment_received', stripeSession: session.id },
      },
      { id: null, role: 'system' }
    )
    await postToChannel(lead.discordChannelId, {
      embeds: [
        {
          title: '✅ Payment received',
          description: `Thanks${amount ? ` — ${amount} received` : ''}! A team member will deliver your order shortly.`,
          color: 0x22c55e,
        },
      ],
    })
    await postAdminNotify(
      '💳 Card payment received (Stripe)',
      [`Deal: DEAL-${lead.dealNumber}`, `Customer: ${lead.discordUsername}`, amount ? `Amount: ${amount}` : ''],
      0x22c55e
    )
  }
  return NextResponse.json({ received: true })
}
