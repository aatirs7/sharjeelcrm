import { NextResponse } from 'next/server'
import { verifySquareSignature, type SquarePayment, type SquareRefund } from '@/lib/square'
import { recordSquarePayment, recordSquareRefund } from '@/lib/square-payments'

export const dynamic = 'force-dynamic'

/**
 * Square webhook (registered in Square as exactly SQUARE_WEBHOOK_URL).
 * Verifies the HMAC signature before doing anything. payment.created /
 * payment.updated with a COMPLETED payment record the sale on the matching
 * ticket; refund.created / refund.updated with a COMPLETED refund mark the sale
 * refunded. Idempotent, so Square's retries and duplicate events are safe.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const raw = await req.text()
  const check = verifySquareSignature(raw, req.headers.get('x-square-hmacsha256-signature'))
  if (!check.ok) {
    console.warn('[square webhook] rejected:', check.reason)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let event: { type?: string; event_id?: string; data?: { object?: { payment?: SquarePayment; refund?: SquareRefund } } }
  try {
    event = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Bad JSON' }, { status: 400 })
  }

  try {
    const type = event.type ?? ''
    const obj = event.data?.object
    if ((type === 'payment.created' || type === 'payment.updated') && obj?.payment) {
      const r = await recordSquarePayment(obj.payment)
      console.log('[square webhook]', type, obj.payment.id, r.kind)
      return NextResponse.json({ ok: true, result: r.kind })
    }
    if ((type === 'refund.created' || type === 'refund.updated') && obj?.refund) {
      const r = await recordSquareRefund(obj.refund)
      console.log('[square webhook]', type, obj.refund.id, r)
      return NextResponse.json({ ok: true, result: r })
    }
    return NextResponse.json({ ok: true, ignored: type })
  } catch (e) {
    // 500 makes Square retry later; the daily sync is the backstop either way.
    console.error('[square webhook] failed:', e)
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }
}
