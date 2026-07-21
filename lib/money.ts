/**
 * All money is integer cents. Never floats in storage.
 *
 * Revenue split (three ways, always sums to the full price):
 *   supplierPayoutCents = round(priceCents * 0.55)   // supplier
 *   serviceFeeCents     = round(priceCents * 0.10)   // service / infrastructure
 *   profitCents         = priceCents - supplier - service   // the 35%, remainder so it always balances
 *   commissionCents     = affiliate ? round(priceCents * rate) : 0
 *   netProfitCents      = profitCents - commissionCents
 *
 * TODO(sharjeel): confirm commission base before go-live. This computes commission
 * off the GROSS price and subtracts it from the 35% profit (netProfit shrinks,
 * supplier and service shares are untouched). If commission should come off gross
 * before the split instead, change the split base here — single source of truth.
 */

export const SUPPLIER_SHARE = 0.55
export const SERVICE_SHARE = 0.1
export const PROFIT_SHARE = 0.35

/** Display labels so the percentages live in exactly one place. */
export const SUPPLIER_PCT = `${Math.round(SUPPLIER_SHARE * 100)}%`
export const SERVICE_PCT = `${Math.round(SERVICE_SHARE * 100)}%`
export const PROFIT_PCT = `${Math.round(PROFIT_SHARE * 100)}%`

export interface OrderMoneyInput {
  priceCents: number
  /** Affiliate commission rate (e.g. 0.10). Omit / 0 when no affiliate. */
  commissionRate?: number | string | null
}

export interface OrderMoney {
  supplierPayoutCents: number
  serviceFeeCents: number
  profitCents: number
  commissionCents: number
  netProfitCents: number
}

export function computeOrderMoney({ priceCents, commissionRate }: OrderMoneyInput): OrderMoney {
  const rate = commissionRate == null ? 0 : Number(commissionRate)
  const supplierPayoutCents = Math.round(priceCents * SUPPLIER_SHARE)
  const serviceFeeCents = Math.round(priceCents * SERVICE_SHARE)
  const profitCents = priceCents - supplierPayoutCents - serviceFeeCents
  const commissionCents = rate > 0 ? Math.round(priceCents * rate) : 0
  const netProfitCents = profitCents - commissionCents
  return { supplierPayoutCents, serviceFeeCents, profitCents, commissionCents, netProfitCents }
}

/**
 * Same split applied to an aggregate revenue figure (e.g. live Stripe gross).
 * Used by the dashboard and revenue page, which derive money from Stripe.
 */
export function splitRevenue(revenueCents: number): {
  supplierPayoutCents: number
  serviceFeeCents: number
  profitCents: number
} {
  const supplierPayoutCents = Math.round(revenueCents * SUPPLIER_SHARE)
  const serviceFeeCents = Math.round(revenueCents * SERVICE_SHARE)
  return {
    supplierPayoutCents,
    serviceFeeCents,
    profitCents: revenueCents - supplierPayoutCents - serviceFeeCents,
  }
}

/** Cents → "$1,234.56" for display. UI never recomputes money, only formats it. */
export function formatCents(cents: number | null | undefined): string {
  const value = (cents ?? 0) / 100
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value)
}
