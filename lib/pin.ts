import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Simple shared-PIN gate for the whole CRM. The cookie never stores the PIN —
 * it stores an HMAC of it, so reading the cookie doesn't reveal the code.
 * Set APP_PIN (and ideally APP_PIN_SECRET) in the environment to change it.
 */
export const PIN_COOKIE = 'crm_session'
export const PIN_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

function pin(): string {
  return (process.env.APP_PIN || '11005').trim()
}

function secret(): string {
  return process.env.APP_PIN_SECRET || process.env.CRON_SECRET || 'the-desk-pin-fallback'
}

/** HMAC-sign an arbitrary payload with the shared secret. Used by sessions too. */
export function signValue(value: string): string {
  return createHmac('sha256', secret()).update(value).digest('hex')
}

/** The value a legacy PIN-only session cookie holds (pre-roles, admin). */
export function sessionToken(): string {
  return signValue(pin())
}

export function equals(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export function isValidSession(cookieValue: string | undefined): boolean {
  return !!cookieValue && equals(cookieValue, sessionToken())
}

export function isCorrectPin(input: string): boolean {
  return equals(input.trim(), pin())
}
