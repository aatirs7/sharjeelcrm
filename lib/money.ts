/**
 * All money is integer cents. Never floats in storage.
 *
 * Split logic (per spec):
 *   supplierPayoutCents = round(priceCents * 0.85)   // supplier always gets 85%
 *   profitCents         = priceCents - supplierPayout // the 15%
 *   commissionCents     = affiliate ? round(priceCents * rate) : 0
 *   netProfitCents      = profitCents - commissionCents
 *
 * TODO(sharjeel): confirm commission base before go-live. This computes commission
 * off the GROSS price and subtracts it from the 15% profit (netProfit shrinks,
 * supplier still gets 85%). If commission should come off gross before the split
 * instead, change the split base here — it is the single source of truth.
 */

export const SUPPLIER_SHARE = 0.85

export interface OrderMoneyInput {
  priceCents: number
  /** Affiliate commission rate (e.g. 0.10). Omit / 0 when no affiliate. */
  commissionRate?: number | string | null
}

export interface OrderMoney {
  supplierPayoutCents: number
  profitCents: number
  commissionCents: number
  netProfitCents: number
}

export function computeOrderMoney({ priceCents, commissionRate }: OrderMoneyInput): OrderMoney {
  const rate = commissionRate == null ? 0 : Number(commissionRate)
  const supplierPayoutCents = Math.round(priceCents * SUPPLIER_SHARE)
  const profitCents = priceCents - supplierPayoutCents
  const commissionCents = rate > 0 ? Math.round(priceCents * rate) : 0
  const netProfitCents = profitCents - commissionCents
  return { supplierPayoutCents, profitCents, commissionCents, netProfitCents }
}

/** Cents → "$1,234.56" for display. UI never recomputes money, only formats it. */
export function formatCents(cents: number | null | undefined): string {
  const value = (cents ?? 0) / 100
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value)
}
