import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { pushSubscriptions } from '@/lib/db/schema'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

/** Remove a device's push subscription when the owner turns notifications off. */
export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: { endpoint?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 })
  }
  if (body.endpoint) {
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, body.endpoint))
  }
  return NextResponse.json({ ok: true })
}
