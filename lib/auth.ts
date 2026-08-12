import { cookies } from 'next/headers'
import { eq } from 'drizzle-orm'
import { db } from './db'
import { reps, type Rep } from './db/schema'
import { PIN_COOKIE, parseSession, type Session } from './session'

// ---------------------------------------------------------------------------
// Identity comes from the HMAC-signed session cookie (see lib/session.ts):
//  - admin  -> the single local admin rep; sees everything.
//  - coach  -> scoped to their own coach_id; read-only dashboards only.
// Server actions that mutate call requireRep(), which now asserts admin, so a
// coach session can never drive an admin mutation even if it reaches the action.
// ---------------------------------------------------------------------------

const LOCAL_REP_ID = 'local_admin'

async function ensureLocalRep(): Promise<Rep> {
  const existing = await db.query.reps.findFirst({ where: eq(reps.id, LOCAL_REP_ID) })
  if (existing) return existing
  const [created] = await db
    .insert(reps)
    .values({ id: LOCAL_REP_ID, displayName: 'Admin', role: 'admin' })
    .onConflictDoNothing()
    .returning()
  // onConflictDoNothing returns [] on a race; re-read in that case.
  return created ?? (await db.query.reps.findFirst({ where: eq(reps.id, LOCAL_REP_ID) }))!
}

/** The current session (role + coachId) from the cookie, or null. */
export async function getSession(): Promise<Session | null> {
  const jar = await cookies()
  return parseSession(jar.get(PIN_COOKIE)?.value)
}

export async function isAdmin(): Promise<boolean> {
  return (await getSession())?.role === 'admin'
}

/** The signed-in coach's id, or null when the session is not a coach. */
export async function getCurrentCoachId(): Promise<string | null> {
  const s = await getSession()
  return s?.role === 'coach' ? s.coachId : null
}

/** For admin pages: the local admin rep (display name + task inbox owner). */
export async function getCurrentRep(): Promise<Rep | null> {
  if (!(await isAdmin())) return null
  return ensureLocalRep()
}

/**
 * Guard for every mutating server action. Asserts an admin session, then returns
 * the local admin rep. Throws for coach/anonymous sessions (defense in depth on
 * top of the proxy).
 */
export async function requireRep(): Promise<Rep> {
  if (!(await isAdmin())) throw new Error('Forbidden: admin session required')
  return ensureLocalRep()
}

export async function requireAdmin(): Promise<Rep> {
  return requireRep()
}
