'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { issues, orders, issueType, replacementStatus } from '../db/schema'
import { requireRep } from '../auth'
import { warrantyState } from '../warranty'

type IssueTypeValue = (typeof issueType.enumValues)[number]
type ReplacementStatusValue = (typeof replacementStatus.enumValues)[number]

export interface CreateIssueInput {
  orderId: string
  issueType: IssueTypeValue
  replacementStatus?: ReplacementStatusValue
  resolutionNotes?: string | null
}

/**
 * Open an issue against an order. Snapshots whether the order was inside its
 * warranty window at open time (active/expiring = valid; expired/none = not).
 */
export async function createIssue(input: CreateIssueInput): Promise<void> {
  await requireRep()
  const order = await db.query.orders.findFirst({ where: eq(orders.id, input.orderId) })
  if (!order) throw new Error('Order not found')

  const state = warrantyState(order.warrantyEnd)
  const warrantyValidAtOpen = state === 'active' || state === 'expiring'

  await db.insert(issues).values({
    orderId: input.orderId,
    issueType: input.issueType,
    warrantyValidAtOpen,
    replacementStatus: input.replacementStatus ?? 'none',
    resolutionNotes: input.resolutionNotes?.trim() || null,
  })
  revalidatePath('/issues')
  revalidatePath(`/orders/${input.orderId}`)
}

export interface UpdateIssueInput {
  issueType?: IssueTypeValue
  replacementStatus?: ReplacementStatusValue
  resolutionNotes?: string | null
  proofUrl?: string | null
}

export async function updateIssue(id: string, input: UpdateIssueInput): Promise<void> {
  await requireRep()
  const patch: Partial<typeof issues.$inferInsert> = {}
  if (input.issueType !== undefined) patch.issueType = input.issueType
  if (input.replacementStatus !== undefined) patch.replacementStatus = input.replacementStatus
  if (input.resolutionNotes !== undefined) patch.resolutionNotes = input.resolutionNotes ?? null
  if (input.proofUrl !== undefined) patch.proofUrl = input.proofUrl?.trim() || null

  await db.update(issues).set(patch).where(eq(issues.id, id))
  revalidatePath('/issues')
}

export async function resolveIssue(id: string): Promise<void> {
  await requireRep()
  await db
    .update(issues)
    .set({ resolvedAt: new Date(), replacementStatus: 'resolved' })
    .where(eq(issues.id, id))
  revalidatePath('/issues')
}

export async function reopenIssue(id: string): Promise<void> {
  await requireRep()
  await db.update(issues).set({ resolvedAt: null }).where(eq(issues.id, id))
  revalidatePath('/issues')
}
