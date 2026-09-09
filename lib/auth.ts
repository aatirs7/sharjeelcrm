import { cookies } from 'next/headers'
import { eq } from 'drizzle-orm'
import { db } from './db'
import { reps, type Rep } from './db/schema'
import { PIN_COOKIE, parseSession, type Session } from './session'
import { can, isStaffRole, type Capability, type Role } from './permissions'

// ---------------------------------------------------------------------------
// Identity from the HMAC-signed session cookie (lib/session.ts):
//  - admin  -> the local admin rep; sees everything.
//  - worker -> a reps row; handles deals only (no money/coach admin).
//  - coach  -> scoped to their own coach_id; read-only dashboards.
// Guards: requireStaff() = admin or worker (deal mutations); requireAdmin() =
// admin only (money, coaches, payouts, content).
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
  return created ?? (await db.query.reps.findFirst({ where: eq(reps.id, LOCAL_REP_ID) }))!
}

export async function getSession(): Promise<Session | null> {
  const jar = await cookies()
  return parseSession(jar.get(PIN_COOKIE)?.value)
}

export async function getRole(): Promise<Role | null> {
  return (await getSession())?.role ?? null
}

/** True for owner or admin (full financial/coach access). */
export async function isAdmin(): Promise<boolean> {
  const r = await getRole()
  return r === 'owner' || r === 'admin'
}

export async function isOwner(): Promise<boolean> {
  return (await getRole()) === 'owner'
}

export async function hasCapability(cap: Capability): Promise<boolean> {
  return can(await getRole(), cap)
}

/** The signed-in coach's id, or null when the session is not a coach. */
export async function getCurrentCoachId(): Promise<string | null> {
  const s = await getSession()
  return s?.role === 'coach' ? s.coachId : null
}

/** The acting rep (owner -> local admin; other staff -> their rep row), else null. */
export async function getCurrentRep(): Promise<Rep | null> {
  const s = await getSession()
  if (!s || !isStaffRole(s.role)) return null
  if (s.role === 'owner' && (!s.repId || s.repId === 'local_admin')) return ensureLocalRep()
  if (s.repId) return (await db.query.reps.findFirst({ where: eq(reps.id, s.repId) })) ?? ensureLocalRep()
  return ensureLocalRep()
}

/** Guard for deal/ticket mutations — any staff. Returns the acting rep. */
export async function requireStaff(): Promise<Rep> {
  const rep = await getCurrentRep()
  if (!rep) throw new Error('Forbidden: staff session required')
  return rep
}

/** Guard requiring a specific capability. */
export async function requireCapability(cap: Capability): Promise<Rep> {
  const rep = await getCurrentRep()
  if (!rep || !can(await getRole(), cap)) throw new Error(`Forbidden: ${cap} required`)
  return rep
}

/** Guard for money/coach mutations — owner or admin. */
export async function requireAdmin(): Promise<Rep> {
  if (!(await isAdmin())) throw new Error('Forbidden: admin session required')
  return (await getCurrentRep()) ?? ensureLocalRep()
}

/** Guard for owner-only actions (workers, settings, permissions). */
export async function requireOwner(): Promise<Rep> {
  if (!(await isOwner())) throw new Error('Forbidden: owner session required')
  return ensureLocalRep()
}

// Back-compat alias: existing deal/ticket actions call requireRep().
export const requireRep = requireStaff
