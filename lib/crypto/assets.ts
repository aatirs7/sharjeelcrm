/**
 * Coins the CRM can confirm automatically, and how their amounts are stored.
 *
 * `decimals` is the base unit everything is stored and compared in (sats,
 * wei, USDT micro-units, lamports). USDT is 6 decimals on Ethereum and 18 on
 * BSC; both are normalised to 6 before comparing. `quoteDecimals` is how
 * precise the amount shown to the buyer is.
 */
export type Asset = 'BTC' | 'ETH' | 'USDT' | 'SOL'

export const ASSETS: Record<Asset, { decimals: number; quoteDecimals: number; volatile: boolean; coinbase?: string }> = {
  BTC: { decimals: 8, quoteDecimals: 8, volatile: true, coinbase: 'BTC-USD' },
  ETH: { decimals: 18, quoteDecimals: 6, volatile: true, coinbase: 'ETH-USD' },
  USDT: { decimals: 6, quoteDecimals: 2, volatile: false },
  SOL: { decimals: 9, quoteDecimals: 5, volatile: true, coinbase: 'SOL-USD' },
}

/** Quotes for coins whose price moves are held this long, then need a fresh quote. */
export const VOLATILE_QUOTE_MS = 2 * 60 * 60 * 1000

export function assetFor(coin: string): Asset | null {
  const c = coin.trim().toUpperCase()
  return c === 'BTC' || c === 'ETH' || c === 'USDT' || c === 'SOL' ? c : null
}

/** "0.00981234" style display of base units, trailing zeros trimmed. */
export function formatUnits(units: string | bigint, asset: Asset): string {
  const d = ASSETS[asset].decimals
  const s = BigInt(units).toString().padStart(d + 1, '0')
  const whole = s.slice(0, s.length - d)
  const frac = s.slice(s.length - d).replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : whole
}

/** Base units for a USD amount at a coin price, rounded to the quote precision. */
export function unitsForUsd(usdCents: number, asset: Asset, rateUsd: number | null): bigint {
  const { decimals, quoteDecimals } = ASSETS[asset]
  if (asset === 'USDT') return BigInt(usdCents) * BigInt(10 ** (decimals - 2))
  if (!rateUsd || rateUsd <= 0) throw new Error(`no ${asset} price`)
  const coin = usdCents / 100 / rateUsd
  const q = BigInt(Math.round(coin * 10 ** quoteDecimals))
  return q * BigInt(10) ** BigInt(decimals - quoteDecimals)
}

/** USD cents a base-unit amount is worth at a coin price. */
export function usdCentsFor(units: string | bigint, asset: Asset, rateUsd: number | null): number {
  const d = ASSETS[asset].decimals
  const coin = Number(BigInt(units)) / 10 ** d
  return Math.round(coin * (asset === 'USDT' ? 1 : (rateUsd ?? 0)) * 100)
}

/** Live USD prices for the volatile coins (Coinbase public spot price, no key). */
export async function getRates(timeoutMs = 1200): Promise<Partial<Record<Asset, number>>> {
  const out: Partial<Record<Asset, number>> = {}
  await Promise.all(
    (Object.keys(ASSETS) as Asset[])
      .filter((a) => ASSETS[a].coinbase)
      .map(async (a) => {
        try {
          const res = await fetch(`https://api.coinbase.com/v2/prices/${ASSETS[a].coinbase}/spot`, {
            signal: AbortSignal.timeout(timeoutMs),
            cache: 'no-store',
          })
          if (!res.ok) return
          const j = (await res.json()) as { data?: { amount?: string } }
          const v = Number(j.data?.amount)
          if (Number.isFinite(v) && v > 0) out[a] = v
        } catch {
          /* leave this coin without a price */
        }
      })
  )
  return out
}

export function cryptoAutoEnabled(): boolean {
  return process.env.CRYPTO_AUTO_ENABLED === 'true'
}
