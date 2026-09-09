import { signValue, equals, isValidSession, PIN_COOKIE, PIN_MAX_AGE } from './pin'

export { PIN_COOKIE, PIN_MAX_AGE }

/**
 * Role-bearing session, HMAC-signed so the cookie carries identity without a DB
 * lookup at the edge. Cookie value = "<role>:<coachId>:<hmac(role:coachId)>".
 * A legacy PIN-only cookie (single hex string, no colons) is still accepted as
 * an admin session so existing logins survive the upgrade.
 */
import type { Role } from './permissions'
export type { Role }

const ROLES: Role[] = ['owner', 'admin', 'manager', 'worker', 'coach']

export interface Session {
  role: Role
  coachId: string | null // set when role === 'coach'
  repId: string | null // set for staff roles (owner/admin/manager/worker)
}

/** subjectId is the coach id (coach) or rep id (staff). */
export function mintSession(role: Role, subjectId: string | null): string {
  const payload = `${role}:${subjectId ?? ''}`
  return `${payload}:${signValue(payload)}`
}

export function parseSession(token: string | undefined): Session | null {
  if (!token) return null
  const parts = token.split(':')
  // Legacy admin cookie: a single HMAC of the PIN, no role prefix -> owner.
  if (parts.length === 1) {
    return isValidSession(token) ? { role: 'owner', coachId: null, repId: 'local_admin' } : null
  }
  if (parts.length !== 3) return null
  const [role, subjectId, sig] = parts
  if (!ROLES.includes(role as Role)) return null
  const payload = `${role}:${subjectId}`
  if (!equals(sig, signValue(payload))) return null
  const r = role as Role
  return {
    role: r,
    coachId: r === 'coach' ? subjectId || null : null,
    repId: r !== 'coach' ? subjectId || null : null,
  }
}

/** Hash a coach login code for storage/comparison (never store the code plain). */
export function hashLoginCode(code: string): string {
  return signValue(`login:${code.trim()}`)
}
