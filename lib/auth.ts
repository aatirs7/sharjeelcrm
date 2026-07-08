import { eq } from 'drizzle-orm'
import { db } from './db'
import { reps, type Rep } from './db/schema'

// ---------------------------------------------------------------------------
// Auth is currently DISABLED (Clerk removed to ship without a login wall).
// Every request runs as a single local admin rep, so all pages — including the
// admin-only financial cards — are visible. Re-add Clerk to gate the app:
// this file + proxy.ts + a ClerkProvider in app/layout.tsx are the only seams.
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

export async function getCurrentRep(): Promise<Rep | null> {
  return ensureLocalRep()
}

export async function requireRep(): Promise<Rep> {
  return ensureLocalRep()
}

export async function isAdmin(): Promise<boolean> {
  const rep = await ensureLocalRep()
  return rep.role === 'admin'
}

export async function requireAdmin(): Promise<Rep> {
  return ensureLocalRep()
}
