// Live Stripe stats via the REST API (no SDK dependency). Read-only.
// Needs a SECRET or RESTRICTED key (sk_... / rk_...). A publishable key
// (pk_...) cannot read account data and is treated as "not configured".

const BASE = 'https://api.stripe.com/v1'

function key(): string | null {
  const k = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_TOKEN || ''
  return k.startsWith('sk_') || k.startsWith('rk_') ? k : null
}

export interface StripeStats {
  configured: boolean
  mode?: 'live' | 'test'
  error?: string
  availableCents?: number
  pendingCents?: number
  currency?: string
  charges?: { id: string; amountCents: number; status: string; created: number; description: string | null }[]
  payouts?: { id: string; amountCents: number; status: string; arrival: number }[]
  volume30dCents?: number
}

async function sget<T = Record<string, unknown>>(k: string, path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${k}` } })
  if (!res.ok) throw new Error(`stripe ${path} ${res.status}`)
  return res.json() as Promise<T>
}

export async function getStripeStats(): Promise<StripeStats> {
  const k = key()
  if (!k) return { configured: false }
  const mode = k.includes('_live_') ? 'live' : 'test'
  try {
    const monthAgo = Math.floor(Date.now() / 1000) - 30 * 86400
    const [balance, charges, payouts] = await Promise.all([
      sget<{ available: { amount: number; currency: string }[]; pending: { amount: number }[] }>(k, '/balance'),
      sget<{ data: { id: string; amount: number; status: string; paid: boolean; created: number; description: string | null }[] }>(k, `/charges?limit=100&created[gte]=${monthAgo}`),
      sget<{ data: { id: string; amount: number; status: string; arrival_date: number }[] }>(k, '/payouts?limit=5'),
    ])
    // Gross volume = succeeded charges in the last 30d (settled or pending).
    const volume30dCents = charges.data
      .filter((c) => c.status === 'succeeded' && c.paid)
      .reduce((s, c) => s + c.amount, 0)
    return {
      configured: true,
      mode,
      currency: balance.available[0]?.currency?.toUpperCase() ?? 'USD',
      availableCents: balance.available.reduce((s, b) => s + b.amount, 0),
      pendingCents: balance.pending.reduce((s, b) => s + b.amount, 0),
      charges: charges.data.slice(0, 8).map((c) => ({
        id: c.id,
        amountCents: c.amount,
        status: c.status,
        created: c.created,
        description: c.description,
      })),
      payouts: payouts.data.map((p) => ({
        id: p.id,
        amountCents: p.amount,
        status: p.status,
        arrival: p.arrival_date,
      })),
      volume30dCents,
    }
  } catch (e) {
    return { configured: true, mode, error: e instanceof Error ? e.message : 'stripe error' }
  }
}
