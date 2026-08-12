/**
 * All money is integer cents. Never floats in storage.
 *
 * Revenue split (three ways, always sums to the full price):
 *   supplierPayoutCents = round(priceCents * 0.55)   // supplier
 *   serviceFeeCents     = round(priceCents * 0.10)   // service / infrastructure
 *   profitCents         = priceCents - supplier - service   // the 35%, remainder so it always balances
 *   commissionCents     = commissionForSale(price, coach)   // coach commission (see seam below)
 *   netProfitCents      = profitCents - commissionCents
 *
 * TODO(sharjeel): confirm commission base before go-live. Commission is computed
 * off the GROSS price and subtracted from the 35% profit (netProfit shrinks,
 * supplier and service shares are untouched). If commission should come off gross
 * before the split instead, change the split base here (single source of truth).
 */

export const SUPPLIER_SHARE = 0.55
export const SERVICE_SHARE = 0.1
export const PROFIT_SHARE = 0.35

/** Display labels so the percentages live in exactly one place. */
export const SUPPLIER_PCT = `${Math.round(SUPPLIER_SHARE * 100)}%`
export const SERVICE_PCT = `${Math.round(SERVICE_SHARE * 100)}%`
export const PROFIT_PCT = `${Math.round(PROFIT_SHARE * 100)}%`

// ---------------------------------------------------------------------------
// Commission seam
// ---------------------------------------------------------------------------
// The commission AMOUNT lives behind this one function so switching the model
// later (percent-of-price -> flat-per-buyer by tier) is a one-line change.
//
// TODO(sharjeel): flip COMMISSION_MODE to 'flat' and confirm TIER_RATE_CENTS
// once the flat model is approved. Nothing downstream changes; every consumer
// reads commissionForSale()'s output and is agnostic to the mode.

export type CoachTier = 'bronze' | 'silver' | 'gold'
export const COMMISSION_MODE: 'percent' | 'flat' = 'percent'
/** Dormant until COMMISSION_MODE === 'flat'. 100 / 125 / 150 dollars. */
export const TIER_RATE_CENTS: Record<CoachTier, number> = {
  bronze: 10000,
  silver: 12500,
  gold: 15000,
}

/**
 * Minimum confirmed buyers IN THE CURRENT MONTH to hold each tier. Tier is
 * resolved from these and stored on the coach by the daily sweep. Tier only
 * changes the payout amount once COMMISSION_MODE flips to 'flat'.
 * TODO(sharjeel): confirm the buyer thresholds.
 */
export const TIER_THRESHOLDS: Record<CoachTier, number> = {
  bronze: 0,
  silver: 5,
  gold: 15,
}

/** Tier a coach earns from their confirmed-buyer count this month. */
export function tierForBuyers(confirmedBuyers: number): CoachTier {
  if (confirmedBuyers >= TIER_THRESHOLDS.gold) return 'gold'
  if (confirmedBuyers >= TIER_THRESHOLDS.silver) return 'silver'
  return 'bronze'
}

export interface CommissionCoach {
  tier?: CoachTier | null
  commissionRate?: number | string | null
}

/**
 * The commission a coach earns on one sale, in cents.
 * - percent mode (current): round(priceCents * coach.commissionRate)
 * - flat mode (dormant):    TIER_RATE_CENTS[coach.tier]
 * A missing coach earns nothing.
 */
export function commissionForSale(priceCents: number, coach: CommissionCoach | null | undefined): number {
  if (!coach) return 0
  if (COMMISSION_MODE === 'flat') {
    return TIER_RATE_CENTS[(coach.tier ?? 'bronze') as CoachTier]
  }
  const rate = coach.commissionRate == null ? 0 : Number(coach.commissionRate)
  return rate > 0 ? Math.round(priceCents * rate) : 0
}

export interface OrderMoneyInput {
  priceCents: number
  /** Commission amount in cents, already resolved via commissionForSale(). */
  commissionCents?: number
}

export interface OrderMoney {
  supplierPayoutCents: number
  serviceFeeCents: number
  profitCents: number
  commissionCents: number
  netProfitCents: number
}

export function computeOrderMoney({ priceCents, commissionCents = 0 }: OrderMoneyInput): OrderMoney {
  const supplierPayoutCents = Math.round(priceCents * SUPPLIER_SHARE)
  const serviceFeeCents = Math.round(priceCents * SERVICE_SHARE)
  const profitCents = priceCents - supplierPayoutCents - serviceFeeCents
  const netProfitCents = profitCents - commissionCents
  return { supplierPayoutCents, serviceFeeCents, profitCents, commissionCents, netProfitCents }
}

/**
 * True when a sale's commission exceeds its profit (net goes negative). Matters
 * most under flat mode on cheap accounts; surfaced as a warning on order/revenue
 * views so a coach payout never quietly outruns the margin.
 */
export function commissionExceedsProfit(o: {
  commissionCents?: number | null
  profitCents?: number | null
}): boolean {
  return (o.commissionCents ?? 0) > (o.profitCents ?? 0)
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
