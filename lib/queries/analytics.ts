import { db } from '../db'
import { orders, leads, coaches, customers, reps } from '../db/schema'

export interface Bar {
  label: string
  value: number // primary (revenue cents or count)
  sub?: string
}

export interface Analytics {
  salesByProduct: Bar[]
  salesByWorker: Bar[]
  revenueByCoach: Bar[]
  lostReasons: Bar[]
  refundRatePct: number
  repeatCustomerRatePct: number
  avgOrderValueCents: number
  revenueByDay: { day: string; cents: number }[]
}

const day = (d: Date) => d.toISOString().slice(0, 10)

export async function getAnalytics(): Promise<Analytics> {
  const [allOrders, allLeads, coachRows, custRows, repRows] = await Promise.all([
    db.select().from(orders),
    db.select().from(leads),
    db.select().from(coaches),
    db.select().from(customers),
    db.select().from(reps),
  ])
  const paid = allOrders.filter((o) => o.paymentStatus === 'paid')
  const refunds = allOrders.filter((o) => o.paymentStatus === 'refunded' || o.paymentStatus === 'chargeback')
  const repName = new Map(repRows.map((r) => [r.id, r.displayName ?? r.id]))
  const leadById = new Map(allLeads.map((l) => [l.id, l]))

  // Sales by product (order.package) — revenue + count.
  const prod = new Map<string, { cents: number; n: number }>()
  for (const o of paid) {
    const k = o.package || '—'
    const cur = prod.get(k) ?? { cents: 0, n: 0 }
    cur.cents += o.priceCents
    cur.n += 1
    prod.set(k, cur)
  }
  const salesByProduct: Bar[] = [...prod.entries()]
    .map(([label, v]) => ({ label, value: v.cents, sub: `${v.n} sold` }))
    .sort((a, b) => b.value - a.value)

  // Sales by worker (via the deal's assigned rep).
  const worker = new Map<string, { cents: number; n: number }>()
  for (const o of paid) {
    const lead = o.leadId ? leadById.get(o.leadId) : null
    const rid = lead?.assignedRepId
    if (!rid) continue
    const cur = worker.get(rid) ?? { cents: 0, n: 0 }
    cur.cents += o.priceCents
    cur.n += 1
    worker.set(rid, cur)
  }
  const salesByWorker: Bar[] = [...worker.entries()]
    .map(([rid, v]) => ({ label: repName.get(rid) ?? rid, value: v.cents, sub: `${v.n} sales` }))
    .sort((a, b) => b.value - a.value)

  const revenueByCoach: Bar[] = coachRows
    .filter((c) => c.revenueCents > 0)
    .map((c) => ({ label: c.name, value: c.revenueCents, sub: `${c.closedSalesCount} sales` }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)

  // Lost reasons.
  const lost = new Map<string, number>()
  for (const l of allLeads) {
    if (l.status === 'cancelled') {
      const k = l.lostReason ?? 'unspecified'
      lost.set(k, (lost.get(k) ?? 0) + 1)
    }
  }
  const lostReasons: Bar[] = [...lost.entries()]
    .map(([label, n]) => ({ label: label.replace(/_/g, ' '), value: n }))
    .sort((a, b) => b.value - a.value)

  const refundRatePct = paid.length + refunds.length ? Math.round((refunds.length / (paid.length + refunds.length)) * 100) : 0
  const buyers = custRows.filter((c) => c.totalOrders > 0)
  const repeatCustomerRatePct = buyers.length ? Math.round((buyers.filter((c) => c.totalOrders > 1).length / buyers.length) * 100) : 0
  const avgOrderValueCents = paid.length ? Math.round(paid.reduce((s, o) => s + o.priceCents, 0) / paid.length) : 0

  // Revenue by day, last 30 days.
  const byDay = new Map<string, number>()
  const now = new Date()
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    byDay.set(day(d), 0)
  }
  for (const o of paid) {
    if (!o.paidAt) continue
    const k = day(new Date(o.paidAt))
    if (byDay.has(k)) byDay.set(k, (byDay.get(k) ?? 0) + o.priceCents)
  }
  const revenueByDay = [...byDay.entries()].map(([day, cents]) => ({ day, cents }))

  return {
    salesByProduct,
    salesByWorker,
    revenueByCoach,
    lostReasons,
    refundRatePct,
    repeatCustomerRatePct,
    avgOrderValueCents,
    revenueByDay,
  }
}
