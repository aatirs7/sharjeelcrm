import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Square is the card processor (Stripe was banned in Oct 2026). Plain REST, no
 * SDK. Env (Vercel, production):
 *   SQUARE_ACCESS_TOKEN      production access token (sensitive)
 *   SQUARE_SIGNATURE_KEY     webhook subscription signature key (sensitive)
 *   SQUARE_LOCATION_ID       the Shah Accounts location (LR6YJ4KJG7XMW)
 *   SQUARE_WEBHOOK_URL       the URL exactly as registered in Square
 */
const API = 'https://connect.squareup.com/v2'
const SQUARE_VERSION = '2025-10-16'
export const DEFAULT_WEBHOOK_URL = 'https://shahmircrm.vercel.app/api/square/webhook'

function token(): string | null {
  return process.env.SQUARE_ACCESS_TOKEN?.trim() || null
}
export function squareLocationId(): string {
  return process.env.SQUARE_LOCATION_ID?.trim() || 'LR6YJ4KJG7XMW'
}
export function squareConfigured(): boolean {
  return !!token()
}

export class SquareError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
  }
}

async function squareFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const t = token()
  if (!t) throw new SquareError('SQUARE_ACCESS_TOKEN is not set', 0)
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${t}`,
      'Square-Version': SQUARE_VERSION,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  })
  const body = (await res.json().catch(() => ({}))) as { errors?: { detail?: string; code?: string }[] }
  if (!res.ok) {
    const e = body.errors?.[0]
    throw new SquareError(`Square ${res.status}: ${e?.detail ?? e?.code ?? 'request failed'}`, res.status)
  }
  return body as T
}

export interface SquareMoney {
  amount: number
  currency: string
}
export interface SquarePayment {
  id: string
  status: 'APPROVED' | 'PENDING' | 'COMPLETED' | 'CANCELED' | 'FAILED'
  amount_money: SquareMoney
  total_money?: SquareMoney
  order_id?: string
  created_at: string
  buyer_email_address?: string
  note?: string
  receipt_url?: string
  refunded_money?: SquareMoney
  customer_id?: string
  card_details?: { card?: { cardholder_name?: string; last_4?: string; card_brand?: string } }
  billing_address?: { first_name?: string; last_name?: string }
}
export interface SquareRefund {
  id: string
  status: 'PENDING' | 'COMPLETED' | 'REJECTED' | 'FAILED'
  payment_id: string
  amount_money: SquareMoney
}

/** Confirms the token works and names the location, for Settings / ops checks. */
export async function checkSquareConnection(): Promise<{ ok: true; locationName: string } | { ok: false; error: string }> {
  try {
    const r = await squareFetch<{ location: { name: string } }>(`/locations/${squareLocationId()}`)
    return { ok: true, locationName: r.location.name }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'unknown error' }
  }
}

/**
 * A one-off Square checkout link for one ticket (deal). The order's
 * reference_id carries the lead id, so a completed payment maps straight back
 * to the ticket. Same lead + amount -> same idempotency key -> same link, so a
 * double tap never creates two Square orders. No tips, no taxes: the amount
 * charged is exactly `amountCents`.
 */
export async function createSquarePaymentLink(input: {
  leadId: string
  dealNumber: number
  productName: string
  amountCents: number
  redirectUrl?: string
  buyerEmail?: string | null
}): Promise<{ url: string; orderId: string }> {
  const r = await squareFetch<{ payment_link: { url: string; order_id: string } }>('/online-checkout/payment-links', {
    method: 'POST',
    body: JSON.stringify({
      // Compact so it never needs truncating: lead id (hex) + amount.
      idempotency_key: `l${input.leadId.replace(/-/g, '')}a${input.amountCents}`,
      description: `DEAL-${input.dealNumber}`,
      order: {
        location_id: squareLocationId(),
        reference_id: input.leadId,
        line_items: [
          {
            name: input.productName.slice(0, 500),
            quantity: '1',
            base_price_money: { amount: input.amountCents, currency: 'USD' },
          },
        ],
      },
      checkout_options: {
        allow_tipping: false,
        ask_for_shipping_address: false,
        ...(input.redirectUrl ? { redirect_url: input.redirectUrl } : {}),
      },
      ...(input.buyerEmail ? { pre_populated_data: { buyer_email: input.buyerEmail } } : {}),
      payment_note: `DEAL-${input.dealNumber}`,
    }),
  })
  return { url: r.payment_link.url, orderId: r.payment_link.order_id }
}

export async function getSquarePayment(paymentId: string): Promise<SquarePayment> {
  const r = await squareFetch<{ payment: SquarePayment }>(`/payments/${paymentId}`)
  return r.payment
}

/** The order's reference_id (our lead id) for a payment, if it was made from one of our links. */
export async function getSquareOrderReference(orderId: string): Promise<string | null> {
  const r = await squareFetch<{ order: { reference_id?: string } }>(`/orders/${orderId}`)
  return r.order.reference_id ?? null
}

/** Completed + other payments at our location since `since`, oldest first. */
export async function listSquarePayments(since: Date): Promise<SquarePayment[]> {
  const out: SquarePayment[] = []
  let cursor: string | undefined
  for (let page = 0; page < 20; page++) {
    const q = new URLSearchParams({
      begin_time: since.toISOString(),
      location_id: squareLocationId(),
      sort_order: 'ASC',
      limit: '100',
    })
    if (cursor) q.set('cursor', cursor)
    const r = await squareFetch<{ payments?: SquarePayment[]; cursor?: string }>(`/payments?${q}`)
    out.push(...(r.payments ?? []))
    if (!r.cursor) break
    cursor = r.cursor
  }
  return out
}

export function webhookUrl(): string {
  return process.env.SQUARE_WEBHOOK_URL?.trim() || DEFAULT_WEBHOOK_URL
}

/**
 * Square signs `notificationUrl + rawBody` with HMAC-SHA256 (base64) using the
 * subscription's signature key; the URL must be byte-for-byte the one
 * registered in Square.
 */
export function verifySquareSignature(rawBody: string, signature: string | null): {
  ok: boolean
  reason?: string
} {
  const key = (process.env.SQUARE_SIGNATURE_KEY || process.env.SQUARE_WEBHOOK_SIGNATURE_KEY)?.trim()
  if (!key) return { ok: false, reason: 'no signature key configured' }
  if (!signature) return { ok: false, reason: 'missing x-square-hmacsha256-signature' }
  const expected = createHmac('sha256', key).update(webhookUrl() + rawBody).digest('base64')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: `signature mismatch (expected ${expected.slice(0, 8)}…, got ${signature.slice(0, 8)}…)` }
  }
  return { ok: true }
}

/** Name and email Square holds for a payer (customer record), for matching. */
export async function getSquareCustomer(customerId: string): Promise<{ name: string | null; email: string | null }> {
  const r = await squareFetch<{ customer: { given_name?: string; family_name?: string; email_address?: string } }>(
    `/customers/${customerId}`,
  )
  const name = [r.customer.given_name, r.customer.family_name].filter(Boolean).join(' ') || null
  return { name, email: r.customer.email_address ?? null }
}
