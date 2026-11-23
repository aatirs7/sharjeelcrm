import { and, asc, eq, inArray, isNotNull, isNull, lt, lte, sql } from 'drizzle-orm'
import { db } from '../db'
import { cryptoPayments, cryptoQuotes, cryptoScanState, leads, orders, products } from '../db/schema'
import { getSetting } from '../settings'
import { createOrderForLead } from '../deal'
import { postToChannel } from '../discord'
import { postAdminNotify } from '../discord-posts'
import { formatCents } from '../money'
import { assetFor, cryptoAutoEnabled, formatUnits, getRates, usdCentsFor, type Asset } from './assets'
import { explorerUrl, scanBitcoin, scanBsc, scanEthereum, scanSolana, type Chain, type Incoming, type ScanResult } from './chains'
import { cancelOpenQuotes } from './quotes'

const PAID_MESSAGE = 'Thanks, your payment is confirmed! We will send your login details within 24-48 hours.'
const DUST_CENTS = 100 // incoming payments worth under $1 are spam/dust: kept, never alerted
const STALE_ALERT_MS = 3 * 60 * 60 * 1000
const REALERT_MS = 6 * 60 * 60 * 1000
const CLOCK_SLACK_MS = 10 * 60 * 1000

export type Outcome = 'matched' | 'unmatched' | 'late' | 'duplicate' | 'ignored' | 'seen'

export interface ScanSummary {
  enabled: boolean
  chains: Record<string, { ok: boolean; found: number; error?: string }>
  outcomes: Partial<Record<Outcome, number>>
}

interface Wallets {
  btc: string | null
  evm: string | null
  sol: string | null
  usdt: boolean
  eth: boolean
}

async function walletAddresses(): Promise<Wallets> {
  const list = await getSetting('cryptoAddresses')
  const by = (a: Asset) => list.find((w) => assetFor(w.coin) === a)?.address?.trim() || null
  const evm = by('USDT') ?? by('ETH')
  return { btc: by('BTC'), evm, sol: by('SOL'), usdt: !!by('USDT'), eth: !!by('ETH') }
}

/**
 * Decide what one incoming payment is and act on it. Every payment is claimed
 * once (unique chain + tx), so running the scan again never double-records.
 * A sale is recorded only when the payment equals exactly one open quote of
 * that coin, made before the payment arrived. A payment after a BTC/ETH/SOL
 * quote expired is recorded only if it is still worth the quoted dollars.
 */
export async function handleIncoming(p: Incoming, rates: Partial<Record<Asset, number>>): Promise<Outcome> {
  const units = p.units.toString()
  const valueCents = usdCentsFor(p.units, p.asset, rates[p.asset] ?? null)
  const known = p.asset === 'USDT' || rates[p.asset] != null

  if (known && valueCents < DUST_CENTS) {
    await db
      .insert(cryptoPayments)
      .values({ chain: p.chain, txHash: p.txHash, asset: p.asset, amountUnits: units, blockTime: p.at, status: 'ignored' })
      .onConflictDoNothing()
    return 'ignored'
  }

  const claimed = await db
    .insert(cryptoPayments)
    .values({ chain: p.chain, txHash: p.txHash, asset: p.asset, amountUnits: units, blockTime: p.at, status: 'pending' })
    .onConflictDoNothing()
    .returning({ id: cryptoPayments.id })
  if (!claimed.length) return 'seen'
  const paymentId = claimed[0].id
  const setPayment = (status: Outcome, extra: { quoteId?: string; leadId?: string } = {}) =>
    db.update(cryptoPayments).set({ status, ...extra }).where(eq(cryptoPayments.id, paymentId))

  const amountText = `${formatUnits(p.units, p.asset)} ${p.asset}${p.asset !== 'USDT' && known ? ` (about ${formatCents(valueCents)})` : ''}`
  const link = explorerUrl(p.chain, p.txHash)

  const candidates = await db
    .select()
    .from(cryptoQuotes)
    .where(
      and(
        eq(cryptoQuotes.asset, p.asset),
        eq(cryptoQuotes.amountUnits, units),
        inArray(cryptoQuotes.status, ['open', 'expired']),
        lte(cryptoQuotes.createdAt, new Date(p.at.getTime() + CLOCK_SLACK_MS))
      )
    )
    .orderBy(sql`case when ${cryptoQuotes.status} = 'open' then 0 else 1 end`, asc(cryptoQuotes.createdAt))
  const quote = candidates[0]

  if (!quote) {
    await setPayment('unmatched')
    await postAdminNotify(
      '🪙 Crypto received, no matching order',
      [
        `Amount: ${amountText}`,
        `Transaction: ${link}`,
        'It does not match the exact amount of any open order, so nothing was recorded.',
        'If a buyer says it is theirs, check the transaction and press Mark Paid in their ticket.',
      ],
      0xf59e0b
    )
    return 'unmatched'
  }

  const lead = await db.query.leads.findFirst({ where: eq(leads.id, quote.leadId) })
  const dealLine = lead ? `Deal: DEAL-${lead.dealNumber} (${lead.discordUsername})` : 'Deal: unknown'

  const expired = !!quote.expiresAt && p.at > quote.expiresAt
  if (expired && (!known || valueCents < quote.usdCents)) {
    await setPayment('late', { quoteId: quote.id, leadId: quote.leadId })
    await postAdminNotify(
      '🪙 Late crypto payment, check before confirming',
      [
        dealLine,
        `Amount: ${amountText}`,
        `It arrived after the 2-hour price hold and is now worth less than the ${formatCents(quote.usdCents)} quoted.`,
        `Transaction: ${link}`,
        'If you accept it, press Mark Paid in the ticket.',
      ],
      0xf59e0b
    )
    return 'late'
  }

  const won = await db
    .update(cryptoQuotes)
    .set({ status: 'paid', paidTx: p.txHash, paidAt: p.at })
    .where(and(eq(cryptoQuotes.id, quote.id), inArray(cryptoQuotes.status, ['open', 'expired'])))
    .returning({ id: cryptoQuotes.id })
  if (!won.length || !lead) {
    await setPayment('duplicate', { quoteId: quote.id, leadId: quote.leadId })
    await postAdminNotify('🪙 Crypto payment needs a look', [dealLine, `Amount: ${amountText}`, `Transaction: ${link}`, 'The order it matched was already settled.'], 0xf59e0b)
    return 'duplicate'
  }

  await recordCryptoSale(lead, quote.usdCents, p.txHash)
  await setPayment('matched', { quoteId: quote.id, leadId: lead.id })
  await postAdminNotify(
    '🪙 Crypto payment confirmed automatically',
    [dealLine, `Amount: ${amountText}`, `Recorded as ${formatCents(quote.usdCents)}.`, `Transaction: ${link}`, 'The buyer has been told. Deliver the account in the ticket.'],
    0x22c55e
  )
  return 'matched'
}

async function recordCryptoSale(lead: typeof leads.$inferSelect, usdCents: number, txHash: string) {
  await db
    .update(leads)
    .set({ status: 'payment_received', paymentMethod: 'crypto', paymentRef: txHash })
    .where(eq(leads.id, lead.id))
  await cancelOpenQuotes(lead.id)
  const product = lead.productId ? await db.query.products.findFirst({ where: eq(products.id, lead.productId) }) : null
  await createOrderForLead(
    lead.id,
    { packageName: product?.name ?? 'TikTok Shop Account', priceCents: usdCents, paymentMethod: 'crypto' },
    { markCompleted: false }
  )
  await db
    .update(orders)
    .set({ transactionId: txHash })
    .where(and(eq(orders.leadId, lead.id), isNull(orders.transactionId)))
  if (lead.discordChannelId) {
    await postToChannel(lead.discordChannelId, {
      embeds: [{ title: '✅ Payment received', description: PAID_MESSAGE, color: 0x22c55e }],
    }).catch(() => false)
  }
}

async function stateFor(chain: Chain) {
  const row = await db.query.cryptoScanState.findFirst({ where: eq(cryptoScanState.chain, chain) })
  if (row) return row
  const [created] = await db
    .insert(cryptoScanState)
    .values({ chain, since: new Date() })
    .onConflictDoNothing()
    .returning()
  return created ?? (await db.query.cryptoScanState.findFirst({ where: eq(cryptoScanState.chain, chain) }))!
}

/** Expire BTC/ETH/SOL quotes past their price hold, and drop very old ones. */
async function tidyQuotes() {
  const now = new Date()
  await db
    .update(cryptoQuotes)
    .set({ status: 'expired' })
    .where(and(eq(cryptoQuotes.status, 'open'), isNotNull(cryptoQuotes.expiresAt), lt(cryptoQuotes.expiresAt, now)))
  await db
    .update(cryptoQuotes)
    .set({ status: 'cancelled' })
    .where(
      and(
        inArray(cryptoQuotes.status, ['open', 'expired']),
        lt(cryptoQuotes.createdAt, new Date(now.getTime() - 14 * 86_400_000))
      )
    )
}

/** One pass over every wallet. Each chain fails on its own; staff hear if one stays down. */
export async function runCryptoScan(): Promise<ScanSummary> {
  const summary: ScanSummary = { enabled: cryptoAutoEnabled(), chains: {}, outcomes: {} }
  if (!summary.enabled) return summary
  const w = await walletAddresses()
  const rates = await getRates(4000)

  const jobs: { chain: Chain; run: (s: Awaited<ReturnType<typeof stateFor>>) => Promise<ScanResult> }[] = []
  if (w.btc) jobs.push({ chain: 'btc', run: (s) => scanBitcoin(w.btc!, s.since) })
  if (w.evm && (w.eth || w.usdt)) jobs.push({ chain: 'eth', run: (s) => scanEthereum(w.evm!, s.since) })
  if (w.evm && w.usdt) jobs.push({ chain: 'bsc', run: (s) => scanBsc(w.evm!, s.cursor) })
  if (w.sol) jobs.push({ chain: 'sol', run: (s) => scanSolana(w.sol!, s.cursor, s.since) })

  for (const job of jobs) {
    const state = await stateFor(job.chain)
    try {
      const res = await job.run(state)
      for (const p of res.incoming) {
        try {
          const o = await handleIncoming(p, rates)
          summary.outcomes[o] = (summary.outcomes[o] ?? 0) + 1
        } catch (err) {
          console.error('[crypto] payment failed', p.chain, p.txHash, err)
          await postAdminNotify(
            '⚠️ Crypto payment could not be processed',
            [`${formatUnits(p.units, p.asset)} ${p.asset}`, `Transaction: ${explorerUrl(p.chain, p.txHash)}`, 'Check it and press Mark Paid in the buyer ticket if it is theirs.'],
            0xef4444
          ).catch(() => false)
        }
      }
      await db
        .update(cryptoScanState)
        .set({ cursor: res.cursor ?? state.cursor, lastOkAt: new Date(), lastError: null })
        .where(eq(cryptoScanState.chain, job.chain))
      summary.chains[job.chain] = { ok: true, found: res.incoming.length }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      summary.chains[job.chain] = { ok: false, found: 0, error: message }
      const lastGood = (state.lastOkAt ?? state.since).getTime()
      const alerted = state.alertedAt?.getTime() ?? 0
      const now = Date.now()
      const alert = now - lastGood > STALE_ALERT_MS && now - alerted > REALERT_MS
      await db
        .update(cryptoScanState)
        .set({ lastError: message.slice(0, 300), ...(alert ? { alertedAt: new Date() } : {}) })
        .where(eq(cryptoScanState.chain, job.chain))
      if (alert) {
        await postAdminNotify(
          '⚠️ Crypto payments not being checked',
          [
            `The ${job.chain.toUpperCase()} wallet could not be checked for over 3 hours.`,
            'Payments on it will not confirm automatically until this clears. Confirm any in the meantime with Mark Paid.',
          ],
          0xef4444
        ).catch(() => false)
      }
    }
  }
  await tidyQuotes()
  return summary
}
