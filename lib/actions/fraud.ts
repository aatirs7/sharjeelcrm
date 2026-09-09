'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { fraudFlags } from '../db/schema'
import { requireCapability } from '../auth'
import { logAudit } from '../audit'

export async function setFraudStatus(id: string, status: 'reviewed' | 'dismissed'): Promise<void> {
  await requireCapability('fraud')
  await db.update(fraudFlags).set({ status }).where(eq(fraudFlags.id, id))
  await logAudit({ action: 'fraud.review', entity: 'fraud', entityRef: id.slice(0, 8), summary: `Fraud flag ${status}` })
  revalidatePath('/fraud')
}
