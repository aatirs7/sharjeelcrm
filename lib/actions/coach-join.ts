'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { sql } from 'drizzle-orm'
import { db } from '../db'
import { coaches } from '../db/schema'

export interface JoinState {
  error?: string
}

export const COACH_JOIN_COOKIE = 'coach_join'

/** A promo code is letters and digits only, 3 to 20 chars. Stored uppercased. */
function normalizePromo(raw: string): string | null {
  const code = raw.trim().toUpperCase()
  return /^[A-Z0-9]{3,20}$/.test(code) ? code : null
}

/** True when no coach already owns this promo code (case-insensitive). */
export async function promoCodeTaken(code: string): Promise<boolean> {
  const rows = await db
    .select({ id: coaches.id })
    .from(coaches)
    .where(sql`lower(${coaches.promoCode}) = lower(${code})`)
    .limit(1)
  return rows.length > 0
}

/**
 * Self-serve coach signup (spec: shareable invite link). The partner enters a
 * display name and the promo code they want, we make sure the code is free, then
 * hand off to Discord OAuth. The join details ride along in a short-lived cookie
 * so the OAuth callback can create the coach once their Discord is known.
 */
export async function startCoachJoin(_prev: JoinState, formData: FormData): Promise<JoinState> {
  const name = String(formData.get('name') ?? '').trim()
  const promo = normalizePromo(String(formData.get('promoCode') ?? ''))

  if (name.length < 2) return { error: 'Enter your name.' }
  if (!promo) return { error: 'Pick a promo code: 3 to 20 letters or numbers, no spaces.' }
  if (await promoCodeTaken(promo)) {
    return { error: `The code ${promo} is already taken. Try another.` }
  }

  const jar = await cookies()
  jar.set(COACH_JOIN_COOKIE, JSON.stringify({ name, promoCode: promo }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600,
  })

  // Reuse the existing Discord OAuth start; the callback finishes the signup.
  redirect('/api/auth/discord')
}
