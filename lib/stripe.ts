// Live Stripe stats via the REST API (no SDK dependency). Read-only.
// Needs a SECRET or RESTRICTED key (sk_... / rk_...). A publishable key
// (pk_...) cannot read account data and is treated as "not configured".

const BASE = 'https://api.stripe.com/v1'

function key(): string | null {
  const k = (process.env.STRIPE_SECRET_KEY || process.env.STRIPE_TOKEN || '').trim()
  return k.startsWith('sk_') || k.startsWith('rk_') ? k : null
}

interface StripeCharge {
  id: string
  amount: number
  amount_refunded: number
  status: string
  paid: boolean
  refunded: boolean
  created: number
  description: string | null
  billing_details?: { name: string | null; email: string | null }
}

export interface StripeStats {
  configured: boolean
  mode?: 'live' | 'test'
  error?: string
  currency?: string
  /** Settled and withdrawable to the bank right now. */
  availableCents?: number
  /** Charges captured but not yet settled — "incoming". */
  pendingCents?: number
  /** All-time payouts that actually landed in the bank (status = paid). */
  withdrawnCents?: number
  /** Payouts in flight to the bank (pending / in_transit). */
  payoutsInTransitCents?: number
  // derived from charges
  grossCents?: number // all-time captured (buyers paid)
  monthCents?: number // current calendar month
  weekCents?: number // current week (since Monday)
  volume30dCents?: number
  refundedCents?: number
  refundedCount?: number
  paidCount?: number
  monthCount?: number
  weekCount?: number
  charges?: {
    id: string
    amountCents: number
    status: string
    created: number
    name: string | null
    email: string | null
  }[]
  payouts?: { id: string; amountCents: number; status: string; arrival: number }[]
}

async function sget<T>(k: string, path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${k}` } })
  if (!res.ok) throw new Error(`stripe ${path} ${res.status}`)
  return res.json() as Promise<T>
}

/** Paginate any list endpoint (max 10 pages = 1000 records). */
async function allOf<T extends { id: string }>(k: string, path: string): Promise<T[]> {
  const out: T[] = []
  let startingAfter: string | undefined
  for (let i = 0; i < 10; i++) {
    const q = new URLSearchParams({ limit: '100' })
    if (startingAfter) q.set('starting_after', startingAfter)
    const page = await sget<{ data: T[]; has_more: boolean }>(k, `${path}?${q.toString()}`)
    out.push(...page.data)
    if (!page.has_more || page.data.length === 0) break
    startingAfter = page.data[page.data.length - 1].id
  }
  return out
}

interface StripePayout {
  id: string
  amount: number
  status: string
  arrival_date: number
}

export async function getStripeStats(): Promise<StripeStats> {
  const k = key()
  if (!k) return { configured: false }
  const mode = k.includes('_live_') ? 'live' : 'test'
  try {
    const [balance, charges, allPayouts] = await Promise.all([
      sget<{ available: { amount: number; currency: string }[]; pending: { amount: number }[] }>(k, '/balance'),
      allOf<StripeCharge>(k, '/charges'),
      allOf<StripePayout>(k, '/payouts'),
    ])

    const succeeded = charges.filter((c) => c.status === 'succeeded' && c.paid)
    const now = new Date()
    const monthStart = Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000)
    const weekAnchor = new Date(now)
    weekAnchor.setHours(0, 0, 0, 0)
    weekAnchor.setDate(weekAnchor.getDate() - ((now.getDay() + 6) % 7)) // Monday
    const weekStart = Math.floor(weekAnchor.getTime() / 1000)
    const dayAgo30 = Math.floor(Date.now() / 1000) - 30 * 86400

    const net = (c: StripeCharge) => c.amount - c.amount_refunded
    const inRange = (from: number) => succeeded.filter((c) => c.created >= from)
    const grossCents = succeeded.reduce((s, c) => s + net(c), 0)
    const monthList = inRange(monthStart)
    const weekList = inRange(weekStart)
    const monthCents = monthList.reduce((s, c) => s + net(c), 0)
    const weekCents = weekList.reduce((s, c) => s + net(c), 0)
    const volume30dCents = inRange(dayAgo30).reduce((s, c) => s + net(c), 0)
    const refunded = charges.filter((c) => c.amount_refunded > 0)

    // Payout money: "paid" landed in the bank, pending/in_transit is on its way.
    const withdrawnCents = allPayouts
      .filter((p) => p.status === 'paid')
      .reduce((s, p) => s + p.amount, 0)
    const payoutsInTransitCents = allPayouts
      .filter((p) => p.status === 'pending' || p.status === 'in_transit')
      .reduce((s, p) => s + p.amount, 0)

    return {
      configured: true,
      mode,
      currency: balance.available[0]?.currency?.toUpperCase() ?? 'USD',
      availableCents: balance.available.reduce((s, b) => s + b.amount, 0),
      pendingCents: balance.pending.reduce((s, b) => s + b.amount, 0),
      withdrawnCents,
      payoutsInTransitCents,
      grossCents,
      monthCents,
      weekCents,
      volume30dCents,
      refundedCents: refunded.reduce((s, c) => s + c.amount_refunded, 0),
      refundedCount: refunded.length,
      paidCount: succeeded.length,
      monthCount: monthList.length,
      weekCount: weekList.length,
      charges: charges
        .sort((a, b) => b.created - a.created)
        .slice(0, 8)
        .map((c) => ({
          id: c.id,
          amountCents: c.amount,
          status: c.status,
          created: c.created,
          name: c.billing_details?.name ?? null,
          email: c.billing_details?.email ?? null,
        })),
      payouts: allPayouts.slice(0, 8).map((p) => ({
        id: p.id,
        amountCents: p.amount,
        status: p.status,
        arrival: p.arrival_date,
      })),
    }
  } catch (e) {
    return { configured: true, mode, error: e instanceof Error ? e.message : 'stripe error' }
  }
}
