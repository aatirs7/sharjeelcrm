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
// Site-wide discount
// ---------------------------------------------------------------------------
// Every buyer gets this much off the catalog price of any product. Lives here so
// the amount is a one-line change. It applies wherever a buyer is shown or
// charged a product price (ticket menu, Stripe Checkout, crypto message, Mark
// Completed) and on the Products page. Set to 0 to switch the discount off.

/** Flat discount taken off every product price, in cents. */
export const DISCOUNT_CENTS = 1000 // $10

/** The price a buyer actually pays after the site-wide discount (never below $0). */
export function discountedPrice(priceCents: number): number {
  return Math.max(0, priceCents - DISCOUNT_CENTS)
}

/**
 * "$240.00 (was $250.00, $10.00 off)" — the discounted price with the original
 * alongside it, or just the price when no discount applies.
 */
export function discountedPriceLabel(priceCents: number): string {
  const after = discountedPrice(priceCents)
  if (after === priceCents) return formatCents(priceCents)
  return `${formatCents(after)} (was ${formatCents(priceCents)}, ${formatCents(priceCents - after)} off)`
}

// ---------------------------------------------------------------------------
// Commission seam
// ---------------------------------------------------------------------------
// The commission AMOUNT lives behind this one function so the model is a
// one-line change. CONFIRMED (spec §12): flat $100 per completed referred sale
// for every coach. Tiers stay for the leaderboard/roles only; per §18, tiered
// commission amounts are a future change (flip to per-tier TIER_RATE_CENTS).

export type CoachTier = 'bronze' | 'silver' | 'gold'
export const COMMISSION_MODE: 'percent' | 'flat' = 'flat'
/** Flat commission per completed referred sale (spec §12). */
export const FLAT_COMMISSION_CENTS = 10000 // $100
/** Future per-tier amounts (dormant; §18). Used only if the flat-for-all rule changes. */
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
 * The commission a coach earns on one completed referred sale, in cents.
 * - flat mode (current): FLAT_COMMISSION_CENTS ($100) for every coach (§12).
 * - percent mode (legacy): round(priceCents * coach.commissionRate).
 * A missing coach earns nothing.
 */
export function commissionForSale(priceCents: number, coach: CommissionCoach | null | undefined): number {
  if (!coach) return 0
  if (COMMISSION_MODE === 'flat') {
    return FLAT_COMMISSION_CENTS
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
