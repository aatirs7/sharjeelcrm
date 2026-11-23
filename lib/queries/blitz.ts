import { and, desc, eq, isNotNull } from 'drizzle-orm'
import { db } from '../db'
import { blitzLedger, leads, orders } from '../db/schema'
import { getSetting } from '../settings'

/**
 * Money taken through Blitz, from the CRM's own records. Blitz's API has no
 * balance, fee or withdrawal endpoint, so this is gross card sales confirmed
 * through Blitz (before Blitz's fees), not the live Blitz balance. A sale
 * counts once Blitz confirmed the order PAID (orders.transactionId is the
 * Blitz order id stored on the lead).
 */
export interface BlitzTotals {
  collectedCents: number
  sales: number
  todayCents: number
  todaySales: number
  weekCents: number
  weekSales: number
  refundedCents: number
  lastSaleAt: Date | null
  waitingCheckouts: number
}

export async function getBlitzTotals(): Promise<BlitzTotals> {
  const [rows, waiting] = await Promise.all([
    db
      .select({ priceCents: orders.priceCents, status: orders.status, paidAt: orders.paidAt, createdAt: orders.createdAt })
      .from(orders)
      .innerJoin(leads, and(eq(orders.leadId, leads.id), eq(orders.transactionId, leads.blitzOrderId))),
    db
      .select({ id: leads.id })
      .from(leads)
      .where(and(isNotNull(leads.blitzOrderId), eq(leads.status, 'waiting_payment'))),
  ])

  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const out: BlitzTotals = {
    collectedCents: 0,
    sales: 0,
    todayCents: 0,
    todaySales: 0,
    weekCents: 0,
    weekSales: 0,
    refundedCents: 0,
    lastSaleAt: null,
    waitingCheckouts: waiting.length,
  }
  for (const r of rows) {
    if (r.status === 'refunded' || r.status === 'chargeback') {
      out.refundedCents += r.priceCents
      continue
    }
    const at = new Date(r.paidAt ?? r.createdAt)
    out.collectedCents += r.priceCents
    out.sales++
    if (at >= start) {
      out.todayCents += r.priceCents
      out.todaySales++
    }
    if (at >= weekAgo) {
      out.weekCents += r.priceCents
      out.weekSales++
    }
    if (!out.lastSaleAt || at > out.lastSaleAt) out.lastSaleAt = at
  }
  return out
}

export interface BlitzLedgerEntry {
  id: string
  kind: 'withdrawal' | 'balance_check'
  amountCents: number
  occurredAt: Date
  note: string | null
}

/**
 * Running Blitz balance. Blitz can't be asked for its balance, so the CRM
 * keeps one: start from the last balance check an admin entered (what Blitz
 * showed at that moment, or zero if none), add every confirmed Blitz sale
 * since then minus the fee setting, and take off every withdrawal recorded
 * since then. A balance check resets the drift (fees, anything unrecorded).
 */
export interface BlitzBalance {
  balanceCents: number
  estimated: boolean // true when fees are guessed or nothing was ever checked
  feeBps: number
  salesSinceCheckCents: number
  feesSinceCheckCents: number
  withdrawnSinceCheckCents: number
  withdrawnTotalCents: number
  lastCheck: BlitzLedgerEntry | null
  lastWithdrawal: BlitzLedgerEntry | null
  recent: BlitzLedgerEntry[]
}

export function feeFor(cents: number, bps: number): number {
  return Math.round((cents * bps) / 10_000)
}

export async function getBlitzBalance(): Promise<BlitzBalance> {
  const [ledger, sales, feeBps] = await Promise.all([
    db.select().from(blitzLedger).orderBy(desc(blitzLedger.occurredAt), desc(blitzLedger.createdAt)),
    db
      .select({ priceCents: orders.priceCents, status: orders.status, paidAt: orders.paidAt, createdAt: orders.createdAt })
      .from(orders)
      .innerJoin(leads, and(eq(orders.leadId, leads.id), eq(orders.transactionId, leads.blitzOrderId))),
    getSetting('blitzFeeBps'),
  ])
  const entries: BlitzLedgerEntry[] = ledger.map((r) => ({
    id: r.id,
    kind: r.kind === 'balance_check' ? 'balance_check' : 'withdrawal',
    amountCents: r.amountCents,
    occurredAt: r.occurredAt,
    note: r.note,
  }))
  const lastCheck = entries.find((e) => e.kind === 'balance_check') ?? null
  const after = lastCheck ? lastCheck.occurredAt.getTime() : -Infinity

  let salesSince = 0
  let feesSince = 0
  for (const s of sales) {
    if (s.status === 'refunded' || s.status === 'chargeback') continue
    if (new Date(s.paidAt ?? s.createdAt).getTime() <= after) continue
    salesSince += s.priceCents
    feesSince += feeFor(s.priceCents, feeBps)
  }
  const withdrawals = entries.filter((e) => e.kind === 'withdrawal')
  const withdrawnSince = withdrawals
    .filter((w) => w.occurredAt.getTime() > after)
    .reduce((sum, w) => sum + w.amountCents, 0)

  return {
    balanceCents: (lastCheck?.amountCents ?? 0) + salesSince - feesSince - withdrawnSince,
    estimated: !lastCheck || (salesSince > 0 && feeBps === 0),
    feeBps,
    salesSinceCheckCents: salesSince,
    feesSinceCheckCents: feesSince,
    withdrawnSinceCheckCents: withdrawnSince,
    withdrawnTotalCents: withdrawals.reduce((sum, w) => sum + w.amountCents, 0),
    lastCheck,
    lastWithdrawal: withdrawals[0] ?? null,
    recent: entries.slice(0, 12),
  }
}
