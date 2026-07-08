/**
 * Warranty status is NOT stored — it's computed at read time from `warrantyEnd`.
 * `warrantyEnd` is only ever set when an order is delivered, so a null end means
 * "no warranty yet" (not delivered).
 *
 * Reused by orders, customers, and the dashboard.
 */
export type WarrantyState = 'none' | 'active' | 'expiring' | 'expired'

export const WARRANTY_EXPIRING_DAYS = 7
const DAY = 86_400_000

export function warrantyState(
  warrantyEnd: Date | string | null | undefined,
  now: Date = new Date()
): WarrantyState {
  if (!warrantyEnd) return 'none'
  const end = new Date(warrantyEnd).getTime()
  const t = now.getTime()
  if (end < t) return 'expired'
  if (end - t <= WARRANTY_EXPIRING_DAYS * DAY) return 'expiring'
  return 'active'
}

export function daysUntil(date: Date | string | null | undefined, now: Date = new Date()): number | null {
  if (!date) return null
  return Math.ceil((new Date(date).getTime() - now.getTime()) / DAY)
}
