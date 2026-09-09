import { signValue, equals, isValidSession, PIN_COOKIE, PIN_MAX_AGE } from './pin'

export { PIN_COOKIE, PIN_MAX_AGE }

/**
 * Role-bearing session, HMAC-signed so the cookie carries identity without a DB
 * lookup at the edge. Cookie value = "<role>:<coachId>:<hmac(role:coachId)>".
 * A legacy PIN-only cookie (single hex string, no colons) is still accepted as
 * an admin session so existing logins survive the upgrade.
 */
export type Role = 'admin' | 'coach' | 'worker'

export interface Session {
  role: Role
  coachId: string | null // set when role === 'coach'
  repId: string | null // set when role === 'worker'
}

/** subjectId is the coach id (coach) or worker rep id (worker); '' for admin. */
export function mintSession(role: Role, subjectId: string | null): string {
  const payload = `${role}:${subjectId ?? ''}`
  return `${payload}:${signValue(payload)}`
}

export function parseSession(token: string | undefined): Session | null {
  if (!token) return null
  const parts = token.split(':')
  // Legacy admin cookie: a single HMAC of the PIN, no role prefix.
  if (parts.length === 1) {
    return isValidSession(token) ? { role: 'admin', coachId: null, repId: null } : null
  }
  if (parts.length !== 3) return null
  const [role, subjectId, sig] = parts
  if (role !== 'admin' && role !== 'coach' && role !== 'worker') return null
  const payload = `${role}:${subjectId}`
  if (!equals(sig, signValue(payload))) return null
  return {
    role,
    coachId: role === 'coach' ? subjectId || null : null,
    repId: role === 'worker' ? subjectId || null : null,
  }
}

/** Hash a coach login code for storage/comparison (never store the code plain). */
export function hashLoginCode(code: string): string {
  return signValue(`login:${code.trim()}`)
}
