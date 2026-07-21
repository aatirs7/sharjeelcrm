import { db } from '../db'
import { orders, affiliates } from '../db/schema'

export interface FinanceStats {
  paidCount: number
  revenueCents: number
  revenueThisMonthCents: number
  supplierPayoutCents: number
  serviceFeeCents: number
  grossProfitCents: number
  commissionCents: number
  netProfitCents: number
  refundsCount: number
  refundsCents: number
  byMethod: { method: string; cents: number }[]
  commissionOwedCents: number
  commissionPaidCents: number
  affiliates: {
    name: string
    code: string | null
    sales: number
    revenueCents: number
    owedCents: number
    paidCents: number
  }[]
}

/** All money is integer cents. Pulls the full financial picture from orders + affiliates. */
export async function getFinanceStats(): Promise<FinanceStats> {
  const [allOrders, affs] = await Promise.all([
    db.select().from(orders),
    db.select().from(affiliates),
  ])

  const paid = allOrders.filter((o) => o.paymentStatus === 'paid')
  const refunds = allOrders.filter(
    (o) => o.paymentStatus === 'refunded' || o.paymentStatus === 'chargeback'
  )
  const sum = <T>(arr: T[], f: (o: T) => number) => arr.reduce((s, o) => s + f(o), 0)

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const paidThisMonth = paid.filter((o) => o.paidAt && new Date(o.paidAt) >= monthStart)

  const byMethodMap = new Map<string, number>()
  for (const o of paid) {
    const m = o.paymentMethod ?? 'other'
    byMethodMap.set(m, (byMethodMap.get(m) ?? 0) + o.priceCents)
  }

  return {
    paidCount: paid.length,
    revenueCents: sum(paid, (o) => o.priceCents),
    revenueThisMonthCents: sum(paidThisMonth, (o) => o.priceCents),
    supplierPayoutCents: sum(paid, (o) => o.supplierPayoutCents),
    serviceFeeCents: sum(paid, (o) => o.serviceFeeCents ?? 0),
    grossProfitCents: sum(paid, (o) => o.profitCents),
    commissionCents: sum(paid, (o) => o.commissionCents),
    netProfitCents: sum(paid, (o) => o.netProfitCents ?? 0),
    refundsCount: refunds.length,
    refundsCents: sum(refunds, (o) => o.priceCents),
    byMethod: [...byMethodMap.entries()]
      .map(([method, cents]) => ({ method, cents }))
      .sort((a, b) => b.cents - a.cents),
    commissionOwedCents: sum(affs, (a) => a.commissionOwedCents),
    commissionPaidCents: sum(affs, (a) => a.commissionPaidCents),
    affiliates: affs
      .map((a) => ({
        name: a.name,
        code: a.referralCode,
        sales: a.closedSalesCount,
        revenueCents: a.revenueCents,
        owedCents: a.commissionOwedCents,
        paidCents: a.commissionPaidCents,
      }))
      .sort((a, b) => b.revenueCents - a.revenueCents),
  }
}
