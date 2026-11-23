import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { getSetting } from '@/lib/settings'
import { assetFor, cryptoAutoEnabled, getRates } from '@/lib/crypto/assets'
import { scanBitcoin, scanBsc, scanEthereum, scanSolana } from '@/lib/crypto/chains'
import { runCryptoScan } from '@/lib/crypto/scan'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authorized(req: Request): boolean {
  const secret = process.env.SQUARE_OPS_SECRET
  const header = req.headers.get('authorization') ?? ''
  if (!secret) return false
  const a = Buffer.from(header)
  const b = Buffer.from(`Bearer ${secret}`)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Ops (Bearer SQUARE_OPS_SECRET):
 *   ?mode=probe  read each wallet from the server without recording anything,
 *                proving the public chain services answer from Vercel
 *   ?mode=scan   run the real scan now (same as the cron)
 */
export async function GET(req: Request): Promise<NextResponse> {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const mode = new URL(req.url).searchParams.get('mode') ?? 'probe'
  if (mode === 'scan') return NextResponse.json(await runCryptoScan())

  const wallets = await getSetting('cryptoAddresses')
  const addr = (coin: string) => wallets.find((w) => assetFor(w.coin) === coin)?.address ?? null
  const evm = addr('USDT') ?? addr('ETH')
  const weekAgo = new Date(Date.now() - 7 * 86_400_000)
  const out: Record<string, unknown> = { enabled: cryptoAutoEnabled() }
  const t = async (name: string, fn: () => Promise<{ incoming: unknown[]; cursor: string | null }>) => {
    const started = Date.now()
    try {
      const r = await fn()
      out[name] = { ok: true, incoming: r.incoming.length, cursorSet: !!r.cursor, ms: Date.now() - started }
    } catch (err) {
      out[name] = { ok: false, error: err instanceof Error ? err.message : String(err), ms: Date.now() - started }
    }
  }
  out.rates = await getRates(4000)
  const btc = addr('BTC')
  const sol = addr('SOL')
  if (btc) await t('btc', () => scanBitcoin(btc, weekAgo))
  if (evm) await t('eth', () => scanEthereum(evm, weekAgo))
  if (evm) await t('bsc', () => scanBsc(evm, null))
  if (sol) await t('sol', () => scanSolana(sol, null, weekAgo))
  return NextResponse.json(out)
}
