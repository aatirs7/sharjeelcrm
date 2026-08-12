import { signValue, equals, isValidSession, PIN_COOKIE, PIN_MAX_AGE } from './pin'

export { PIN_COOKIE, PIN_MAX_AGE }

/**
 * Role-bearing session, HMAC-signed so the cookie carries identity without a DB
 * lookup at the edge. Cookie value = "<role>:<coachId>:<hmac(role:coachId)>".
 * A legacy PIN-only cookie (single hex string, no colons) is still accepted as
 * an admin session so existing logins survive the upgrade.
 */
export type Role = 'admin' | 'coach'

export interface Session {
  role: Role
  coachId: string | null
}

export function mintSession(role: Role, coachId: string | null): string {
  const payload = `${role}:${coachId ?? ''}`
  return `${payload}:${signValue(payload)}`
}

export function parseSession(token: string | undefined): Session | null {
  if (!token) return null
  const parts = token.split(':')
  // Legacy admin cookie: a single HMAC of the PIN, no role prefix.
  if (parts.length === 1) {
    return isValidSession(token) ? { role: 'admin', coachId: null } : null
  }
  if (parts.length !== 3) return null
  const [role, coachId, sig] = parts
  if (role !== 'admin' && role !== 'coach') return null
  const payload = `${role}:${coachId}`
  if (!equals(sig, signValue(payload))) return null
  return { role, coachId: coachId || null }
}

/** Hash a coach login code for storage/comparison (never store the code plain). */
export function hashLoginCode(code: string): string {
  return signValue(`login:${code.trim()}`)
}
