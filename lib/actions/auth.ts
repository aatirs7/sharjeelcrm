'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { coaches, reps } from '../db/schema'
import { isCorrectPin, PIN_COOKIE, PIN_MAX_AGE } from '../pin'
import { mintSession, hashLoginCode } from '../session'
import { landingFor, type Role } from '../permissions'

export interface PinState {
  error?: string
}

function setSessionCookie(jar: Awaited<ReturnType<typeof cookies>>, token: string) {
  jar.set(PIN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: PIN_MAX_AGE,
  })
}

/**
 * One login field, two credentials:
 *  - the admin PIN mints an admin session (sees everything);
 *  - a coach login code mints a coach session scoped to that coach.
 * Codes are matched by HMAC (never stored or compared in plaintext).
 */
export async function submitPin(_prev: PinState, formData: FormData): Promise<PinState> {
  const input = String(formData.get('pin') ?? '').trim()
  const next = String(formData.get('next') ?? '/')
  if (!input) return { error: 'Enter your PIN or code.' }

  const jar = await cookies()

  // Master PIN -> owner.
  if (isCorrectPin(input)) {
    setSessionCookie(jar, mintSession('owner', 'local_admin'))
    redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/')
  }

  const codeHash = hashLoginCode(input)

  // Staff login code (owner/admin/manager/worker) — role comes from the rep row.
  const staff = await db.query.reps.findFirst({
    where: and(eq(reps.loginCodeHash, codeHash), eq(reps.active, true)),
  })
  if (staff) {
    const role = (staff.role as Role) ?? 'worker'
    setSessionCookie(jar, mintSession(role, staff.id))
    redirect(landingFor(role))
  }

  // Coach login code (HMAC lookup, active coaches only).
  const coach = await db.query.coaches.findFirst({
    where: and(eq(coaches.loginCodeHash, codeHash), eq(coaches.status, 'active')),
  })
  if (coach) {
    setSessionCookie(jar, mintSession('coach', coach.id))
    redirect('/coach')
  }

  return { error: 'Incorrect PIN or code.' }
}

export async function signOut() {
  const jar = await cookies()
  jar.delete(PIN_COOKIE)
  redirect('/login')
}
