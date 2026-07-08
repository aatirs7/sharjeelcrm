import { auth, currentUser } from '@clerk/nextjs/server'
import { db } from './db'
import { reps, type Rep } from './db/schema'

/**
 * Returns the signed-in rep, lazily upserting a `reps` row from Clerk on first
 * authenticated request (id = Clerk user id). This is the "sync from Clerk"
 * mechanism — no custom auth table, no webhook needed for local dev.
 *
 * Returns null when there is no signed-in user.
 */
export async function getCurrentRep(): Promise<Rep | null> {
  const { userId } = await auth()
  if (!userId) return null

  const user = await currentUser()
  const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses[0]?.emailAddress ?? null
  const displayName =
    [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() ||
    user?.username ||
    email ||
    null

  // Keep name/email fresh on every login; never downgrade an existing role.
  const [rep] = await db
    .insert(reps)
    .values({ id: userId, displayName, email })
    .onConflictDoUpdate({
      target: reps.id,
      set: { displayName, email },
    })
    .returning()

  return rep
}

/** Like getCurrentRep but throws if unauthenticated — for server actions. */
export async function requireRep(): Promise<Rep> {
  const rep = await getCurrentRep()
  if (!rep) throw new Error('Not authenticated')
  return rep
}

export async function isAdmin(): Promise<boolean> {
  const rep = await getCurrentRep()
  return rep?.role === 'admin'
}

/** Throws if the current rep is not an admin — guards payout/profit surfaces. */
export async function requireAdmin(): Promise<Rep> {
  const rep = await requireRep()
  if (rep.role !== 'admin') throw new Error('Forbidden: admin only')
  return rep
}
