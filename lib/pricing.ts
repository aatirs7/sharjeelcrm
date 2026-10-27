/** Flat discount a buyer gets when they came in on a valid coach promo code. */
export const PROMO_DISCOUNT_CENTS = 1000

/** The price a buyer actually pays: base minus the promo discount when the lead
 *  is attributed to a real promo code (promoCodeUsed is only set on a match). */
export function effectivePrice(
  baseCents: number,
  lead: { promoCodeUsed?: string | null } | null | undefined,
): number {
  return lead?.promoCodeUsed ? Math.max(baseCents - PROMO_DISCOUNT_CENTS, 0) : baseCents
}
