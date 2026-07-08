import { isNull, sql } from 'drizzle-orm'
import { db } from '../db'
import { orders, leads, issues } from '../db/schema'
import { warrantyState } from '../warranty'

export type Period = 'week' | 'month'

export interface DashboardMetrics {
  period: Period
  rangeLabel: string
  // range-based
  revenueCents: number
  paidOrders: number
  avgOrderValueCents: number
  refundsCount: number
  refundsCents: number
  supplierPayoutCents: number // admin
  netProfitCents: number // admin
  newLeads: number
  closeRatePct: number | null
  closeRateBasis: string
  bestLeadSource: string | null
  // current-state
  awaitingDelivery: number
  activeWarranties: number
  expiringWarranties: number
  openIssues: number
}

function rangeFor(period: Period): { start: Date; label: string } {
  const now = new Date()
  if (period === 'week') {
    const d = new Date(now)
    const dow = (d.getDay() + 6) % 7 // Monday = 0
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - dow)
    return { start: d, label: 'This week' }
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  return { start, label: 'This month' }
}

const onOrAfter = (date: Date | string | null | undefined, start: Date) =>
  !!date && new Date(date).getTime() >= start.getTime()

export async function getDashboardMetrics(period: Period): Promise<DashboardMetrics> {
  const { start, label } = rangeFor(period)
  const now = new Date()

  const [allOrders, allLeads, openIssuesRow] = await Promise.all([
    db.select().from(orders),
    db.select().from(leads),
    db.select({ n: sql<number>`count(*)::int` }).from(issues).where(isNull(issues.resolvedAt)),
  ])

  // Range-based order metrics (bucketed by paidAt for revenue-linked figures).
  const paidInRange = allOrders.filter(
    (o) => o.paymentStatus === 'paid' && onOrAfter(o.paidAt, start)
  )
  const revenueCents = paidInRange.reduce((s, o) => s + o.priceCents, 0)
  const paidOrders = paidInRange.length
  const avgOrderValueCents = paidOrders ? Math.round(revenueCents / paidOrders) : 0
  const supplierPayoutCents = paidInRange.reduce((s, o) => s + o.supplierPayoutCents, 0)
  const netProfitCents = paidInRange.reduce((s, o) => s + (o.netProfitCents ?? 0), 0)

  const refundsInRange = allOrders.filter(
    (o) =>
      (o.paymentStatus === 'refunded' || o.paymentStatus === 'chargeback') &&
      onOrAfter(o.paidAt ?? o.createdAt, start)
  )
  const refundsCount = refundsInRange.length
  const refundsCents = refundsInRange.reduce((s, o) => s + o.priceCents, 0)

  // Leads (cohort by created date in range).
  const leadsInRange = allLeads.filter((l) => onOrAfter(l.createdAt, start))
  const newLeads = leadsInRange.length
  const won = leadsInRange.filter((l) => l.status === 'won')
  const lost = leadsInRange.filter((l) => l.status === 'lost').length
  const decided = won.length + lost
  const closeRatePct = decided ? Math.round((won.length / decided) * 100) : null

  // Best lead source among won leads in range.
  const sourceCounts = new Map<string, number>()
  for (const l of won) sourceCounts.set(l.source, (sourceCounts.get(l.source) ?? 0) + 1)
  let bestLeadSource: string | null = null
  let bestN = 0
  for (const [src, n] of sourceCounts) {
    if (n > bestN) {
      bestN = n
      bestLeadSource = src
    }
  }

  // Current-state metrics (not range-bound).
  const awaitingDelivery = allOrders.filter(
    (o) => o.status === 'paid' || o.status === 'awaiting_delivery'
  ).length
  const deliveredWithWarranty = allOrders.filter(
    (o) => o.deliveryStatus === 'delivered' && o.warrantyEnd && new Date(o.warrantyEnd) >= now
  )
  const activeWarranties = deliveredWithWarranty.length
  const expiringWarranties = deliveredWithWarranty.filter(
    (o) => warrantyState(o.warrantyEnd, now) === 'expiring'
  ).length

  return {
    period,
    rangeLabel: label,
    revenueCents,
    paidOrders,
    avgOrderValueCents,
    refundsCount,
    refundsCents,
    supplierPayoutCents,
    netProfitCents,
    newLeads,
    closeRatePct,
    closeRateBasis: `${won.length} won / ${decided} decided`,
    bestLeadSource,
    awaitingDelivery,
    activeWarranties,
    expiringWarranties,
    openIssues: openIssuesRow[0]?.n ?? 0,
  }
}
