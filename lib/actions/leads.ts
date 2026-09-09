'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { leads, leadStatus, leadSource, lostReason, paymentMethod } from '../db/schema'
import { logAudit } from '../audit'
import { postAdminNotify } from '../discord-posts'
import { requireRep } from '../auth'
import { createFollowUpTaskForLead } from '../automations'
import { createOrderForLead } from '../deal'

type LeadStatusValue = (typeof leadStatus.enumValues)[number]
type LeadSourceValue = (typeof leadSource.enumValues)[number]
type PaymentMethodValue = (typeof paymentMethod.enumValues)[number]

const dollarsToCents = (dollars: number | string | null | undefined): number | null => {
  if (dollars == null || dollars === '') return null
  const n = typeof dollars === 'string' ? parseFloat(dollars) : dollars
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

export interface CreateLeadInput {
  discordUsername: string
  source: LeadSourceValue
  interest?: string | null
  budgetDollars?: number | string | null
  ticketLink?: string | null
  referralCode?: string | null
  email?: string | null
  assignedRepId?: string | null
}

export async function createLead(input: CreateLeadInput): Promise<string> {
  const rep = await requireRep()
  const [lead] = await db
    .insert(leads)
    .values({
      discordUsername: input.discordUsername.trim(),
      source: input.source,
      interest: input.interest?.trim() || null,
      budgetCents: dollarsToCents(input.budgetDollars),
      ticketLink: input.ticketLink?.trim() || null,
      referralCode: input.referralCode?.trim() || null,
      email: input.email?.trim().toLowerCase() || null,
      assignedRepId: input.assignedRepId || rep.id,
    })
    .returning()
  revalidatePath('/tickets')
  return lead.id
}

export interface UpdateLeadInput {
  interest?: string | null
  budgetDollars?: number | string | null
  source?: LeadSourceValue
  ticketLink?: string | null
  referralCode?: string | null
  email?: string | null
  assignedRepId?: string | null
  notes?: string | null
  lastContactAt?: string | null
  nextFollowUpAt?: string | null
}

export async function updateLeadFields(id: string, input: UpdateLeadInput): Promise<void> {
  await requireRep()
  const patch: Partial<typeof leads.$inferInsert> = {}
  if (input.interest !== undefined) patch.interest = input.interest?.trim() || null
  if (input.budgetDollars !== undefined) patch.budgetCents = dollarsToCents(input.budgetDollars)
  if (input.source !== undefined) patch.source = input.source
  if (input.ticketLink !== undefined) patch.ticketLink = input.ticketLink?.trim() || null
  if (input.referralCode !== undefined) patch.referralCode = input.referralCode?.trim() || null
  if (input.email !== undefined) patch.email = input.email?.trim().toLowerCase() || null
  if (input.assignedRepId !== undefined) patch.assignedRepId = input.assignedRepId || null
  if (input.notes !== undefined) patch.notes = input.notes ?? null
  if (input.lastContactAt !== undefined)
    patch.lastContactAt = input.lastContactAt ? new Date(input.lastContactAt) : null
  if (input.nextFollowUpAt !== undefined)
    patch.nextFollowUpAt = input.nextFollowUpAt ? new Date(input.nextFollowUpAt) : null

  await db.update(leads).set(patch).where(eq(leads.id, id))
  revalidatePath('/tickets')
  revalidatePath(`/tickets/${id}`)
}

type LostReasonValue = (typeof lostReason.enumValues)[number]

/**
 * Move a deal through the pipeline (spec §6). `completed` is intentionally NOT
 * settable here — reaching it happens via convertLeadToOrder, which records the
 * sale and fires the commission. A `cancelled` move can carry a lost reason.
 * Fires a follow-up task when entering `waiting_payment`.
 */
export async function setLeadStatus(
  id: string,
  status: Exclude<LeadStatusValue, 'completed'>,
  lostReasonValue?: LostReasonValue | null
): Promise<void> {
  await requireRep()
  const before = await db.query.leads.findFirst({ where: eq(leads.id, id) })
  await db
    .update(leads)
    .set({ status, lostReason: status === 'cancelled' ? lostReasonValue ?? null : null })
    .where(eq(leads.id, id))
  if (status === 'waiting_payment') {
    await createFollowUpTaskForLead(id)
  }
  await logAudit({
    action: 'deal.status',
    entity: 'deal',
    entityRef: before ? `DEAL-${before.dealNumber}` : null,
    summary: `Deal status ${before?.status ?? '?'} → ${status}${lostReasonValue ? ` (${lostReasonValue})` : ''}`,
    meta: { from: before?.status, to: status, lostReason: lostReasonValue ?? null },
  })
  if (status === 'refunded' || status === 'disputed') {
    await postAdminNotify(
      status === 'refunded' ? '↩️ Refund' : '⚠️ Dispute',
      [`Deal: DEAL-${before?.dealNumber}`, `Customer: ${before?.discordUsername}`],
      0xf43f5e
    )
  } else if (status === 'payment_received') {
    await postAdminNotify(
      '💳 Payment received',
      [`Deal: DEAL-${before?.dealNumber}`, `Customer: ${before?.discordUsername}`],
      0x22c55e
    )
  }
  revalidatePath('/tickets')
  revalidatePath(`/tickets/${id}`)
}

export interface ConvertLeadInput {
  package: string
  priceDollars: number | string
  paymentMethod: PaymentMethodValue
  coachId?: string | null
}

/**
 * Convert a won lead into an order: upsert the customer (by discord username),
 * create a paid order with money computed on write, and mark the lead `won`.
 *
 * TODO(M5/M6): fire order-create automations here — delivery task (rule 3) and
 * customer/affiliate rollups (rules 7–8).
 */
export async function convertLeadToOrder(id: string, input: ConvertLeadInput): Promise<void> {
  await requireRep()
  const orderId = await createOrderForLead(id, {
    packageName: input.package,
    priceCents: dollarsToCents(input.priceDollars) ?? 0,
    paymentMethod: input.paymentMethod,
    coachId: input.coachId ?? null,
  })
  revalidatePath('/tickets')
  revalidatePath(`/tickets/${id}`)
  revalidatePath('/orders')
  redirect(`/orders/${orderId}`)
}
