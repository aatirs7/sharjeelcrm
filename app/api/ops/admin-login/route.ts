import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { coaches, reps } from '@/lib/db/schema'
import { hashLoginCode } from '@/lib/session'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

function authorized(req: Request): boolean {
  const secret = process.env.SQUARE_OPS_SECRET
  const header = req.headers.get('authorization') ?? ''
  if (!secret) return false
  const a = Buffer.from(header)
  const b = Buffer.from(`Bearer ${secret}`)
  return a.length === b.length && timingSafeEqual(a, b)
}

const REP_ID = 'admin_aatir'

/**
 * Temporary ops route (Bearer SQUARE_OPS_SECRET): creates or updates the
 * developer's admin login. The login code is hashed here, never stored or
 * logged in plain text. Remove this route once the login is set up.
 */
export async function POST(req: Request): Promise<NextResponse> {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as { code?: string; email?: string; name?: string }
  const code = String(body.code ?? '').trim()
  if (code.length < 8) return NextResponse.json({ error: 'code must be at least 8 characters' }, { status: 400 })
  const hash = hashLoginCode(code)

  const clashRep = await db.query.reps.findFirst({ where: eq(reps.loginCodeHash, hash), columns: { id: true } })
  const clashCoach = await db.query.coaches.findFirst({ where: eq(coaches.loginCodeHash, hash), columns: { id: true } })
  if ((clashRep && clashRep.id !== REP_ID) || clashCoach) {
    return NextResponse.json({ error: 'that code is already used by someone else, pick another' }, { status: 409 })
  }

  const values = {
    displayName: body.name?.trim() || 'Aatir',
    email: body.email?.trim() || null,
    role: 'admin',
    active: true,
    loginCodeHash: hash,
  }
  await db.insert(reps).values({ id: REP_ID, ...values }).onConflictDoUpdate({ target: reps.id, set: values })
  await logAudit({ action: 'worker.create', entity: 'worker', entityRef: REP_ID, summary: 'Developer admin login set up' })
  return NextResponse.json({ ok: true, id: REP_ID, role: 'admin' })
}
