import { NextResponse } from 'next/server'
import { verifyBlitzSignature } from '@/lib/blitz'
import { sweepBlitzCheckouts } from '@/lib/blitz-payments'

export const dynamic = 'force-dynamic'

/**
 * Blitz webhook. Verifies the signature before doing anything. The payload's
 * shape for one-off orders isn't documented (no order reference is promised),
 * so a checkout.completed only triggers a check of every open Blitz checkout
 * against Blitz's status endpoint, which is the real proof of payment.
 * Idempotent, so Blitz's retries are safe.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const raw = await req.text()
  const check = verifyBlitzSignature(raw, req.headers.get('x-blitz-signature'), req.headers.get('x-blitz-timestamp'))
  if (!check.ok) {
    console.warn('[blitz webhook] rejected:', check.reason)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const event = req.headers.get('x-blitz-event') ?? ''
  if (event !== 'checkout.completed') return NextResponse.json({ ok: true, ignored: event })

  try {
    const r = await sweepBlitzCheckouts(3, 40)
    console.log('[blitz webhook]', req.headers.get('x-blitz-delivery-id'), r)
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    console.error('[blitz webhook] failed:', e)
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }
}
