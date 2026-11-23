import type { Asset } from './assets'

/**
 * Readers for payments into the shop's wallets, one per chain, using free
 * public services (no keys): mempool.space for Bitcoin, Blockscout and a
 * public RPC for Ethereum, a public RPC for BSC, and Solana's public RPC.
 * Each returns only confirmed, successful, incoming payments at or after
 * `since`. Anything still unconfirmed is left for a later scan.
 */
export type Chain = 'btc' | 'eth' | 'bsc' | 'sol'

export interface Incoming {
  chain: Chain
  asset: Asset
  txHash: string // unique per payment; EVM token transfers append ":logIndex"
  units: bigint // base units; USDT always 6 decimals
  at: Date
}

export interface ScanResult {
  incoming: Incoming[]
  cursor: string | null
}

const USDT_ETH = '0xdac17f958d2ee523a2206206994597c13d831ec7'
const USDT_BSC = '0x55d398326f99059ff775485246999027b3197955'
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const ETH_CONFIRMATIONS = 6
const BSC_CONFIRMATIONS = 15
const SOL_PER_RUN = 15

const ETH_RPC = () => process.env.ETH_RPC_URL || 'https://ethereum-rpc.publicnode.com'
const BSC_RPC = () => process.env.BSC_RPC_URL || 'https://bsc-rpc.publicnode.com'
const SOL_RPC = () => process.env.SOL_RPC_URL || 'https://api.mainnet-beta.solana.com'
const BLOCKSCOUT = 'https://eth.blockscout.com/api/v2'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000), cache: 'no-store' })
  if (!res.ok) throw new Error(`GET ${new URL(url).host} -> ${res.status}`)
  return res.json() as Promise<T>
}

async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  let res: Response | null = null
  // Free public nodes rate-limit (429): back off and retry a couple of times.
  for (let attempt = 0; attempt < 4; attempt++) {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    })
    if (res.status !== 429) break
    const wait = Number(res.headers.get('retry-after')) * 1000 || 1500 * (attempt + 1)
    await sleep(Math.min(wait, 6000))
  }
  if (!res || !res.ok) throw new Error(`RPC ${new URL(url).host} ${method} -> ${res?.status}`)
  const j = (await res.json()) as { result?: T; error?: { message?: string } }
  if (j.error) throw new Error(`RPC ${method}: ${j.error.message ?? 'error'}`)
  return j.result as T
}

const same = (a?: string | null, b?: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase()

// ---------------------------------------------------------------- Bitcoin

interface MempoolTx {
  txid: string
  status: { confirmed: boolean; block_time?: number }
  vin: { prevout?: { scriptpubkey_address?: string } | null }[]
  vout: { scriptpubkey_address?: string; value: number }[]
}

export async function scanBitcoin(address: string, since: Date): Promise<ScanResult> {
  const txs = await getJson<MempoolTx[]>(`https://mempool.space/api/address/${address}/txs`)
  const incoming: Incoming[] = []
  for (const t of txs) {
    if (!t.status.confirmed || !t.status.block_time) continue
    const at = new Date(t.status.block_time * 1000)
    if (at < since) continue
    // Spending from this wallet sends change back to it; that is not a payment.
    if (t.vin.some((v) => v.prevout?.scriptpubkey_address === address)) continue
    const sats = t.vout.filter((o) => o.scriptpubkey_address === address).reduce((s, o) => s + o.value, 0)
    if (sats > 0) incoming.push({ chain: 'btc', asset: 'BTC', txHash: t.txid, units: BigInt(sats), at })
  }
  return { incoming, cursor: null }
}

// ---------------------------------------------------------------- Ethereum

interface BsTx {
  hash: string
  status: string | null
  value: string
  confirmations?: number
  timestamp: string
  to?: { hash?: string } | null
}
interface BsInternal {
  transaction_hash: string
  index: number
  success: boolean
  value: string
  block_number: number
  timestamp: string
  to?: { hash?: string } | null
}
interface BsTokenTransfer {
  transaction_hash: string
  log_index: number
  block_number: number
  timestamp: string
  to?: { hash?: string } | null
  token?: { address_hash?: string; address?: string } | null
  total?: { value?: string; decimals?: string } | null
}

export async function scanEthereum(address: string, since: Date): Promise<ScanResult> {
  const head = parseInt(await rpc<string>(ETH_RPC(), 'eth_blockNumber', []), 16)
  const deep = (block: number) => head - block + 1 >= ETH_CONFIRMATIONS
  const [txs, internals, transfers] = await Promise.all([
    getJson<{ items: BsTx[] }>(`${BLOCKSCOUT}/addresses/${address}/transactions?filter=to`),
    getJson<{ items: BsInternal[] }>(`${BLOCKSCOUT}/addresses/${address}/internal-transactions?filter=to`),
    getJson<{ items: BsTokenTransfer[] }>(
      `${BLOCKSCOUT}/addresses/${address}/token-transfers?type=ERC-20&filter=to&token=${USDT_ETH}`
    ),
  ])
  const incoming: Incoming[] = []
  for (const t of txs.items ?? []) {
    const at = new Date(t.timestamp)
    if (at < since || t.status !== 'ok' || !same(t.to?.hash, address)) continue
    if ((t.confirmations ?? 0) < ETH_CONFIRMATIONS || BigInt(t.value || '0') <= BigInt(0)) continue
    incoming.push({ chain: 'eth', asset: 'ETH', txHash: t.hash, units: BigInt(t.value), at })
  }
  // ETH sent by a contract (some exchanges, smart wallets) shows up only here.
  for (const t of internals.items ?? []) {
    const at = new Date(t.timestamp)
    if (at < since || !t.success || !same(t.to?.hash, address) || !deep(t.block_number)) continue
    if (BigInt(t.value || '0') <= BigInt(0)) continue
    incoming.push({ chain: 'eth', asset: 'ETH', txHash: `${t.transaction_hash}:i${t.index}`, units: BigInt(t.value), at })
  }
  for (const t of transfers.items ?? []) {
    const at = new Date(t.timestamp)
    const token = t.token?.address_hash ?? t.token?.address
    if (at < since || !same(t.to?.hash, address) || !same(token, USDT_ETH) || !deep(t.block_number)) continue
    if (t.total?.decimals !== '6' || !t.total?.value) continue
    incoming.push({ chain: 'eth', asset: 'USDT', txHash: `${t.transaction_hash}:${t.log_index}`, units: BigInt(t.total.value), at })
  }
  return { incoming, cursor: null }
}

// ---------------------------------------------------------------- BSC

interface RpcLog {
  transactionHash: string
  logIndex: string
  blockNumber: string
  data: string
}

/** USDT (BEP20, 18 decimals) into the wallet, scanned block range by block range. */
export async function scanBsc(address: string, cursor: string | null): Promise<ScanResult> {
  const head = parseInt(await rpc<string>(BSC_RPC(), 'eth_blockNumber', []), 16)
  const safe = head - BSC_CONFIRMATIONS
  // First run starts now: earlier transfers are history, never matched.
  if (!cursor) return { incoming: [], cursor: String(safe) }
  let from = Number(cursor) + 1
  const topicTo = '0x' + address.slice(2).toLowerCase().padStart(64, '0')
  const incoming: Incoming[] = []
  const blockTimes = new Map<string, Date>()
  const STEP = 2500
  let chunks = 0
  while (from <= safe && chunks < 8) {
    const to = Math.min(from + STEP - 1, safe)
    const logs = await rpc<RpcLog[]>(BSC_RPC(), 'eth_getLogs', [
      {
        fromBlock: '0x' + from.toString(16),
        toBlock: '0x' + to.toString(16),
        address: USDT_BSC,
        topics: [TRANSFER_TOPIC, null, topicTo],
      },
    ])
    for (const l of logs) {
      let at = blockTimes.get(l.blockNumber)
      if (!at) {
        const b = await rpc<{ timestamp: string }>(BSC_RPC(), 'eth_getBlockByNumber', [l.blockNumber, false])
        at = new Date(parseInt(b.timestamp, 16) * 1000)
        blockTimes.set(l.blockNumber, at)
      }
      const raw = BigInt(l.data)
      const scale = BigInt(10) ** BigInt(12) // 18 -> 6 decimals
      // An amount with dust below 6 decimals can't equal a quote; keep it whole-unit floored for the record.
      incoming.push({
        chain: 'bsc',
        asset: 'USDT',
        txHash: `${l.transactionHash}:${parseInt(l.logIndex, 16)}`,
        units: raw / scale,
        at,
      })
    }
    from = to + 1
    chunks++
  }
  return { incoming, cursor: String(from - 1) }
}

// ---------------------------------------------------------------- Solana

interface SolSig {
  signature: string
  err: unknown
}
interface SolTx {
  blockTime: number | null
  meta: { err: unknown; preBalances: number[]; postBalances: number[] } | null
  transaction: { message: { accountKeys: (string | { pubkey: string })[] } }
}

/** Native SOL into the wallet, newest signatures since the last scan. */
export async function scanSolana(address: string, cursor: string | null, since: Date): Promise<ScanResult> {
  const sigs = await rpc<SolSig[]>(SOL_RPC(), 'getSignaturesForAddress', [
    address,
    { limit: 100, commitment: 'finalized', ...(cursor ? { until: cursor } : {}) },
  ])
  if (!sigs.length) return { incoming: [], cursor }
  if (!cursor) return { incoming: [], cursor: sigs[0].signature } // first run starts now
  const incoming: Incoming[] = []
  // Oldest first, a limited number per run (the public node is rate-limited);
  // the cursor only moves past what was actually read, so nothing is skipped.
  let last = cursor
  for (const s of sigs.slice().reverse().slice(0, SOL_PER_RUN)) {
    if (s.err) {
      last = s.signature
      continue
    }
    const tx = await rpc<SolTx | null>(SOL_RPC(), 'getTransaction', [
      s.signature,
      { commitment: 'finalized', maxSupportedTransactionVersion: 0 },
    ])
    last = s.signature
    await sleep(400)
    if (!tx?.meta || tx.meta.err || !tx.blockTime) continue
    const at = new Date(tx.blockTime * 1000)
    if (at < since) continue
    const keys = tx.transaction.message.accountKeys.map((k) => (typeof k === 'string' ? k : k.pubkey))
    const i = keys.indexOf(address)
    if (i <= 0) continue // not involved, or the wallet paid the fee (an outgoing transaction)
    const delta = tx.meta.postBalances[i] - tx.meta.preBalances[i]
    if (delta > 0) incoming.push({ chain: 'sol', asset: 'SOL', txHash: s.signature, units: BigInt(delta), at })
  }
  return { incoming, cursor: last }
}

export function explorerUrl(chain: Chain, txHash: string): string {
  const hash = txHash.split(':')[0]
  switch (chain) {
    case 'btc':
      return `https://mempool.space/tx/${hash}`
    case 'eth':
      return `https://etherscan.io/tx/${hash}`
    case 'bsc':
      return `https://bscscan.com/tx/${hash}`
    case 'sol':
      return `https://solscan.io/tx/${hash}`
  }
}
