import { and, eq, isNotNull } from 'drizzle-orm'
import { db } from '../db'
import { leads, orders } from '../db/schema'

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
