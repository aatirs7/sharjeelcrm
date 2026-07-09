/** "payment_pending" -> "Payment Pending" */
export function titleCase(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Tailwind class sets for status pills, keyed by enum value. */
export const LEAD_STATUS_CLASSES: Record<string, string> = {
  new_lead: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  qualified: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
  payment_pending: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  won: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  lost: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
}

export const ORDER_STATUS_CLASSES: Record<string, string> = {
  paid: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  awaiting_delivery: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  delivered: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300',
  closed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  refunded: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
  chargeback: 'bg-red-200 text-red-900 dark:bg-red-950 dark:text-red-300',
}

export const WARRANTY_STATE_CLASSES: Record<string, string> = {
  none: 'bg-muted text-muted-foreground',
  active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  expiring: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  expired: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
}

export const TICKET_TYPE_CLASSES: Record<string, string> = {
  purchase: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  support: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  question: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  other: 'bg-muted text-muted-foreground',
}

export const RISK_STATUS_CLASSES: Record<string, string> = {
  good: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  watch: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  high_risk: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  blocked: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
}
