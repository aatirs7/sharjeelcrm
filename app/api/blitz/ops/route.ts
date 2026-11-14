import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { blitzEnabled, blitzProvider, createBlitzCheckout, getBlitzOrderStatus } from '@/lib/blitz'
import { sweepBlitzCheckouts } from '@/lib/blitz-payments'
import { crmBaseUrl } from '@/lib/app-url'

export const dynamic = 'force-dynamic'

function authorized(req: Request): boolean {
  const secret = process.env.SQUARE_OPS_SECRET
  const header = req.headers.get('authorization') ?? ''
  if (!secret) return false
  const a = Buffer.from(header)
  const b = Buffer.from(`Bearer ${secret}`)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Ops endpoint for Blitz (Bearer SQUARE_OPS_SECRET, same as the Square one):
 *   ?mode=check   proves the key works by creating a $1 checkout. A fixed
 *                 idempotency key means repeat checks reuse the same unpaid
 *                 order. Nobody is charged unless someone pays the link.
 *   ?mode=sweep   confirm any paid Blitz checkouts now (same as the hourly poll)
 */
export async function GET(req: Request): Promise<NextResponse> {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const mode = new URL(req.url).searchParams.get('mode') ?? 'check'

  if (mode === 'sweep') return NextResponse.json(await sweepBlitzCheckouts())

  try {
    const c = await createBlitzCheckout({
      leadId: '00000000-0000-0000-0000-00000000c4ec',
      amountCents: 100,
      returnUrl: `${crmBaseUrl()}/`,
    })
    const status = await getBlitzOrderStatus(c.orderId).catch((e) => ({ error: String(e) }))
    return NextResponse.json({
      ok: true,
      enabled: blitzEnabled(),
      provider: blitzProvider(),
      orderId: c.orderId,
      checkoutHost: new URL(c.url).host,
      status,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, enabled: blitzEnabled(), provider: blitzProvider(), error: e instanceof Error ? e.message : String(e) })
  }
}
