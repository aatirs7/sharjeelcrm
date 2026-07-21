'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { PIN_COOKIE, PIN_MAX_AGE, isCorrectPin, sessionToken } from '@/lib/pin'

export interface PinState {
  error?: string
}

export async function submitPin(_prev: PinState, formData: FormData): Promise<PinState> {
  const pin = String(formData.get('pin') ?? '')
  const next = String(formData.get('next') ?? '/')

  if (!isCorrectPin(pin)) {
    return { error: 'Incorrect PIN.' }
  }

  const jar = await cookies()
  jar.set(PIN_COOKIE, sessionToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: PIN_MAX_AGE,
  })

  // Only allow same-origin paths back.
  redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/')
}

export async function signOut() {
  const jar = await cookies()
  jar.delete(PIN_COOKIE)
  redirect('/login')
}
