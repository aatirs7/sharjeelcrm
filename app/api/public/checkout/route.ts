import { NextResponse } from 'next/server'
import { and, eq, isNotNull, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { products, leads, coaches } from '@/lib/db/schema'
import { createCheckoutSession, stripeStatus } from '@/lib/stripe'
import { getSetting } from '@/lib/settings'

export const dynamic = 'force-dynamic'

// Same $10 promo discount the Discord ticket flow gives, kept in sync here.
const PROMO_DISCOUNT_CENTS = 1000

/**
 * The storefront website starts a checkout here. It creates a real CRM deal
 * (a lead) so the whole existing pipeline applies: the Stripe webhook marks it
 * paid by the leadId it carries, and staff see and fulfil it like any other.
 *
 * Server-to-server only: the website's server calls this with the shared
 * STOREFRONT_SECRET as a bearer token, so no browser ever sees it.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const secret = process.env.STOREFRONT_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    productId?: string
    email?: string
    name?: string
    method?: 'card' | 'crypto'
    promoCode?: string
    returnUrl?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  const { productId, email, name, method, promoCode, returnUrl } = body
  if (!productId || !email || !method || !returnUrl) {
    return NextResponse.json({ error: 'Missing productId, email, method or returnUrl' }, { status: 400 })
  }
  if (method !== 'card' && method !== 'crypto') {
    return NextResponse.json({ error: 'method must be card or crypto' }, { status: 400 })
  }

  const product = await db.query.products.findFirst({
    where: and(eq(products.id, productId), eq(products.active, true)),
  })
  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  // Resolve a cited promo code to a coach, exactly like the ticket flow, so the
  // buyer gets the $10 off and the coach gets the referral credit.
  const code = promoCode?.trim() || null
  let sourceCoachId: string | null = null
  let promoCodeUsed: string | null = null
  if (code) {
    const coach = await db
      .select({ id: coaches.id, promoCode: coaches.promoCode })
      .from(coaches)
      .where(and(sql`lower(${coaches.promoCode}) = lower(${code})`, isNotNull(coaches.promoCode)))
      .limit(1)
    if (coach[0]) {
      sourceCoachId = coach[0].id
      promoCodeUsed = coach[0].promoCode
    }
  }

  const price = promoCodeUsed
    ? Math.max(product.priceCents - PROMO_DISCOUNT_CENTS, 0)
    : product.priceCents

  const cleanEmail = email.trim().toLowerCase()
  const label = (name?.trim() || cleanEmail).slice(0, 80)

  // A website buyer has no Discord ticket, so discordChannelId stays null (the
  // webhook's Discord post safely no-ops on it). The lead still flows to staff.
  const [lead] = await db
    .insert(leads)
    .values({
      discordUsername: label,
      email: cleanEmail,
      productId: product.id,
      source: 'direct',
      ticketType: 'purchase',
      referralCode: code,
      sourceCoachId,
      promoCodeUsed,
      paymentMethod: method,
      status: 'waiting_payment',
    })
    .returning({ id: leads.id, dealNumber: leads.dealNumber })

  if (method === 'crypto') {
    const wallets = (await getSetting('cryptoAddresses')) ?? []
    return NextResponse.json({
      method: 'crypto',
      dealNumber: lead.dealNumber,
      amountCents: price,
      wallets,
    })
  }

  // card
  const stripe = stripeStatus()
  if (!stripe.canCharge || price < 50) {
    return NextResponse.json(
      { error: 'Card checkout is unavailable right now. Please try crypto or contact us.' },
      { status: 503 },
    )
  }
  try {
    const session = await createCheckoutSession({
      leadId: lead.id,
      dealNumber: lead.dealNumber,
      productName: product.name,
      amountCents: price,
      returnUrl,
      customerLabel: label,
    })
    await db
      .update(leads)
      .set({ paymentLink: session.url, stripeSessionId: session.id })
      .where(eq(leads.id, lead.id))
    return NextResponse.json({ method: 'card', url: session.url, dealNumber: lead.dealNumber })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Checkout failed' },
      { status: 502 },
    )
  }
}
