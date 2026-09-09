'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { reps, leads } from '../db/schema'
import { requireAdmin, requireStaff, getCurrentRep } from '../auth'
import { hashLoginCode } from '../session'
import { logAudit } from '../audit'

function slugId(name: string): string {
  return (
    'worker_' +
    (name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) || 'x') +
    '_' +
    randomBytes(2).toString('hex')
  )
}

export interface WorkerInput {
  displayName: string
  email?: string | null
  role?: 'admin' | 'manager' | 'worker'
}

/** Admin: create a worker (or admin) account. */
export async function createWorker(input: WorkerInput): Promise<string> {
  await requireAdmin()
  const id = slugId(input.displayName)
  const role = input.role && ['admin', 'manager', 'worker'].includes(input.role) ? input.role : 'worker'
  await db.insert(reps).values({
    id,
    displayName: input.displayName.trim(),
    email: input.email?.trim() || null,
    role,
  })
  await logAudit({
    action: 'worker.create',
    entity: 'worker',
    entityRef: input.displayName.trim(),
    summary: `Created ${role} ${input.displayName.trim()}`,
  })
  revalidatePath('/workers')
  return id
}

export async function setWorkerActive(id: string, active: boolean): Promise<void> {
  await requireAdmin()
  await db.update(reps).set({ active }).where(eq(reps.id, id))
  revalidatePath('/workers')
}

export async function setWorkerRole(id: string, role: 'admin' | 'manager' | 'worker'): Promise<void> {
  await requireAdmin()
  await db.update(reps).set({ role }).where(eq(reps.id, id))
  await logAudit({
    action: 'worker.role',
    entity: 'worker',
    entityRef: id,
    summary: `Worker role → ${role}`,
  })
  revalidatePath('/workers')
}

/** Generate/rotate a worker login code. Plaintext shown once. */
export async function generateWorkerCode(id: string): Promise<string> {
  await requireAdmin()
  const code = randomBytes(5).toString('hex').toUpperCase()
  await db.update(reps).set({ loginCodeHash: hashLoginCode(code) }).where(eq(reps.id, id))
  await logAudit({ action: 'worker.login_code', entity: 'worker', entityRef: id, summary: 'Generated worker login code' })
  revalidatePath('/workers')
  return code
}

/** Any staff member claims a deal — assigns it to themselves (spec §7). */
export async function claimDeal(leadId: string): Promise<void> {
  const rep = await requireStaff()
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) })
  await db.update(leads).set({ assignedRepId: rep.id }).where(eq(leads.id, leadId))
  await logAudit({
    action: 'deal.claim',
    entity: 'deal',
    entityRef: lead ? `DEAL-${lead.dealNumber}` : leadId.slice(0, 8),
    summary: `${rep.displayName ?? 'Staff'} claimed the deal`,
    meta: { leadId, repId: rep.id },
  })
  revalidatePath('/tickets')
  revalidatePath(`/tickets/${leadId}`)
}
