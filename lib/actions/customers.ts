'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { customers, riskStatus } from '../db/schema'
import { requireRep } from '../auth'

type RiskValue = (typeof riskStatus.enumValues)[number]

export interface UpdateCustomerInput {
  displayName?: string | null
  riskStatus?: RiskValue
  notes?: string | null
}

export async function updateCustomer(id: string, input: UpdateCustomerInput): Promise<void> {
  await requireRep()
  const patch: Partial<typeof customers.$inferInsert> = {}
  if (input.displayName !== undefined) patch.displayName = input.displayName?.trim() || null
  if (input.riskStatus !== undefined) patch.riskStatus = input.riskStatus
  if (input.notes !== undefined) patch.notes = input.notes ?? null

  await db.update(customers).set(patch).where(eq(customers.id, id))
  revalidatePath('/customers')
  revalidatePath(`/customers/${id}`)
}
