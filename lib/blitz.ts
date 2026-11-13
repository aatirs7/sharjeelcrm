import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Blitz (useblitz.co) card checkout. Plain REST, no SDK. Env (Vercel):
 *   BLITZ_ENABLED         "true" to send card buyers to Blitz instead of Square
 *   BLITZ_API_KEY         bk_live_... (or bk_test_... with the sandbox URL)  (sensitive)
 *   BLITZ_API_URL         optional, default live; sandbox is https://api.sandbox.useblitz.co
 *   BLITZ_PROVIDER        optional, STRIPE (default) or PAYPAL, whichever is connected in Blitz
 *   BLITZ_WEBHOOK_SECRET  optional, the company signing secret (sensitive)
 *
 * Docs: https://useblitz.co/developers/checkout and /webhooks. The order status
 * endpoint is the only proof of payment; the return URL and webhook are only
 * triggers to go and check it.
 */
const LIVE_API = 'https://api.nest.useblitz.co'

function apiBase(): string {
  return (process.env.BLITZ_API_URL?.trim() || LIVE_API).replace(/\/+$/, '')
}
function apiKey(): string | null {
  return process.env.BLITZ_API_KEY?.trim() || null
}
export function blitzProvider(): 'STRIPE' | 'PAYPAL' {
  return process.env.BLITZ_PROVIDER?.trim().toUpperCase() === 'PAYPAL' ? 'PAYPAL' : 'STRIPE'
}
/** Blitz is the card processor only when explicitly switched on AND a key is set. */
export function blitzEnabled(): boolean {
  return process.env.BLITZ_ENABLED?.trim().toLowerCase() === 'true' && !!apiKey()
}

export class BlitzError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
  }
}

/** Accepts both the documented { success, data } envelope and a raw object. */
function unwrap<T>(body: unknown): T {
  const b = body as { data?: unknown }
  return (b && typeof b === 'object' && 'data' in b && b.data && typeof b.data === 'object' ? b.data : body) as T
}

async function blitzFetch<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
  const key = apiKey()
  if (auth && !key) throw new BlitzError('BLITZ_API_KEY is not set', 0)
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { Authorization: `Bearer ${key}` } : {}),
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const b = body as { message?: string | string[]; code?: string }
    const msg = Array.isArray(b.message) ? b.message.join('; ') : b.message
    throw new BlitzError(`Blitz ${res.status}: ${msg ?? b.code ?? 'request failed'}`, res.status)
  }
  return unwrap<T>(body)
}

/**
 * One Blitz checkout for one ticket. Same lead + amount -> same idempotency
 * key -> Blitz returns the same order, so a double tap never creates two.
 */
export async function createBlitzCheckout(input: {
  leadId: string
  amountCents: number
  returnUrl: string
}): Promise<{ url: string; orderId: string }> {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new BlitzError('amount must be a positive whole number of cents', 0)
  }
  const r = await blitzFetch<{ orderId?: string; redirectUrl?: string }>('/api/commerce/integration/checkout', {
    method: 'POST',
    body: JSON.stringify({
      amountMinorUnits: String(input.amountCents),
      currency: 'USD',
      provider: blitzProvider(),
      returnUrl: input.returnUrl,
      checkoutMode: 'REDIRECT',
      externalOrderRef: input.leadId,
      idempotencyKey: `l${input.leadId.replace(/-/g, '')}a${input.amountCents}`,
    }),
  })
  if (!r.orderId || !r.redirectUrl) throw new BlitzError('Blitz returned no checkout link', 0)
  return { url: r.redirectUrl, orderId: r.orderId }
}

export interface BlitzOrderStatus {
  status: string
  amountMinorUnits: number
  currency: string
}

/** Public status endpoint: the only signal that should mark a deal paid. */
export async function getBlitzOrderStatus(orderId: string): Promise<BlitzOrderStatus> {
  const r = await blitzFetch<{ status?: string; amountMinorUnits?: string | number; currency?: string }>(
    `/api/commerce/checkout/orders/${encodeURIComponent(orderId)}/status`,
    {},
    false,
  )
  return {
    status: String(r.status ?? '').toUpperCase(),
    amountMinorUnits: Number(r.amountMinorUnits),
    currency: String(r.currency ?? '').toUpperCase(),
  }
}

/**
 * Webhook signature: hex HMAC-SHA256 of `${timestamp}.${rawBody}` with the
 * company signing secret, sent as X-Blitz-Signature with X-Blitz-Timestamp.
 */
export function verifyBlitzSignature(
  rawBody: string,
  signature: string | null,
  timestamp: string | null,
  secret = process.env.BLITZ_WEBHOOK_SECRET?.trim(),
): { ok: true } | { ok: false; reason: string } {
  if (!secret) return { ok: false, reason: 'BLITZ_WEBHOOK_SECRET is not set' }
  if (!signature || !timestamp) return { ok: false, reason: 'missing signature headers' }
  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')
  const got = signature.trim().replace(/^sha256=/i, '').toLowerCase()
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(got, 'utf8')
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: 'signature mismatch' }
  return { ok: true }
}
