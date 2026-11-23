import { NextResponse } from 'next/server'
import { runCryptoScan } from '@/lib/crypto/scan'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Every few minutes: check the shop's crypto wallets and confirm any payment
 * that exactly matches an order's quoted amount (lib/crypto/scan.ts). Vercel
 * Cron sends `Authorization: Bearer <CRON_SECRET>`; checked before any work.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    return NextResponse.json(await runCryptoScan())
  } catch (err) {
    console.error('[cron/crypto] scan failed', err)
    return NextResponse.json({ error: 'scan failed' }, { status: 500 })
  }
}
