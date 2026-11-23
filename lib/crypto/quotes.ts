import { randomInt } from 'node:crypto'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import { cryptoQuotes } from '../db/schema'
import type { CryptoAddress } from '../settings'
import { ASSETS, VOLATILE_QUOTE_MS, assetFor, formatUnits, getRates, unitsForUsd, type Asset } from './assets'

export interface QuotedWallet {
  coin: string
  network: string
  address: string
  amount: string | null // exact amount to send; null when this coin can't be auto-confirmed
}

/** Cancel a deal's open quotes (re-quote, or the deal got paid another way). */
export async function cancelOpenQuotes(leadId: string): Promise<void> {
  await db
    .update(cryptoQuotes)
    .set({ status: 'cancelled' })
    .where(and(eq(cryptoQuotes.leadId, leadId), inArray(cryptoQuotes.status, ['open', 'expired'])))
}

/**
 * Give a deal one exact amount per supported coin. Each amount is the price
 * minus a few cents (1 to 99), picked so no other open order has the same
 * amount of the same coin: that is what lets a payment be matched to its order
 * with no input from the buyer or staff. The database enforces uniqueness.
 */
export async function createQuotes(
  leadId: string,
  priceCents: number,
  wallets: CryptoAddress[]
): Promise<QuotedWallet[]> {
  await cancelOpenQuotes(leadId)
  const needed = [...new Set(wallets.map((w) => assetFor(w.coin)).filter((a): a is Asset => !!a))]
  const rates = needed.some((a) => ASSETS[a].volatile) ? await getRates() : {}

  const amounts = new Map<Asset, string>()
  for (const asset of needed) {
    const rate = ASSETS[asset].volatile ? (rates[asset] ?? null) : null
    if (ASSETS[asset].volatile && !rate) continue // no price right now: this coin falls back to staff
    for (let attempt = 0; attempt < 12; attempt++) {
      const tagCents = randomInt(1, 100)
      const usdCents = priceCents - tagCents
      if (usdCents <= 0) break
      const units = unitsForUsd(usdCents, asset, rate)
      const inserted = await db
        .insert(cryptoQuotes)
        .values({
          leadId,
          asset,
          amountUnits: units.toString(),
          usdCents,
          tagCents,
          rateUsd: rate ? String(rate) : null,
          expiresAt: ASSETS[asset].volatile ? new Date(Date.now() + VOLATILE_QUOTE_MS) : null,
        })
        .onConflictDoNothing()
        .returning({ id: cryptoQuotes.id })
      if (inserted.length) {
        amounts.set(asset, formatUnits(units, asset))
        break
      }
    }
  }

  return wallets.map((w) => {
    const asset = assetFor(w.coin)
    return { coin: w.coin, network: w.network, address: w.address, amount: asset ? (amounts.get(asset) ?? null) : null }
  })
}

/** The buyer-facing text listing each wallet with its exact amount. */
export function quoteMessage(productLine: string, quoted: QuotedWallet[], priceText: string): string {
  const auto = quoted.filter((q) => q.amount)
  const manual = quoted.filter((q) => !q.amount)
  const parts: string[] = [productLine, '']
  if (auto.length) {
    parts.push(
      'Send the **exact amount** shown for the coin you pick. It is unique to your order, so your payment is confirmed here automatically, usually within 15 minutes.',
      ''
    )
    for (const q of auto) {
      parts.push(`**${q.coin}**${q.network ? ` · ${q.network}` : ''}: \`${q.amount}\``, `\`${q.address}\``, '')
    }
    if (auto.some((q) => q.coin.toUpperCase() !== 'USDT')) {
      parts.push('BTC, ETH and SOL amounts are held for 2 hours. After that, press Crypto again for a fresh amount.')
    }
    parts.push('If your wallet or exchange takes its fee out of the amount, add the fee so the exact amount arrives.')
  }
  if (manual.length) {
    parts.push(
      '',
      `${auto.length ? 'Other coins' : 'Wallets'} (send the equivalent of ${priceText}, then reply here with the transaction hash and a team member will confirm):`,
      ''
    )
    for (const q of manual) parts.push(`**${q.coin}**${q.network ? ` · ${q.network}` : ''}`, `\`${q.address}\``, '')
  }
  parts.push('Double-check the network before sending.')
  return parts.join('\n').trim()
}
