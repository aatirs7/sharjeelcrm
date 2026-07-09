'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import {
  leads,
  customers,
  orders,
  affiliates,
  leadStatus,
  leadSource,
  paymentMethod,
} from '../db/schema'
import { requireRep } from '../auth'
import { computeOrderMoney } from '../money'
import {
  createFollowUpTaskForLead,
  createDeliveryTaskForOrder,
  recomputeOrderRollups,
} from '../automations'

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

/**
 * Move a lead through the pre-payment machine. `won` is intentionally NOT
 * settable here — reaching `won` happens via convertLeadToOrder, which also
 * creates the order. Fires rule 2 when entering `payment_pending`.
 */
export async function setLeadStatus(
  id: string,
  status: Exclude<LeadStatusValue, 'won'>
): Promise<void> {
  await requireRep()
  await db.update(leads).set({ status }).where(eq(leads.id, id))
  if (status === 'payment_pending') {
    await createFollowUpTaskForLead(id)
  }
  revalidatePath('/tickets')
  revalidatePath(`/tickets/${id}`)
}

export interface ConvertLeadInput {
  package: string
  priceDollars: number | string
  paymentMethod: PaymentMethodValue
  affiliateId?: string | null
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
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, id) })
  if (!lead) throw new Error('Lead not found')

  // Upsert customer by discord username.
  let customer = await db.query.customers.findFirst({
    where: eq(customers.discordUsername, lead.discordUsername),
  })
  if (!customer) {
    const [created] = await db
      .insert(customers)
      .values({ discordUsername: lead.discordUsername, displayName: lead.discordUsername })
      .returning()
    customer = created
  }

  // Resolve the affiliate: explicit choice wins; otherwise map the lead's
  // referral code to an affiliate that owns that code.
  let affiliateId = input.affiliateId || null
  if (!affiliateId && lead.referralCode) {
    const byCode = await db.query.affiliates.findFirst({
      where: eq(affiliates.referralCode, lead.referralCode),
    })
    if (byCode) affiliateId = byCode.id
  }
  let commissionRate: string | null = null
  if (affiliateId) {
    const aff = await db.query.affiliates.findFirst({ where: eq(affiliates.id, affiliateId) })
    commissionRate = aff?.commissionRate ?? null
  }

  const priceCents = dollarsToCents(input.priceDollars) ?? 0
  const money = computeOrderMoney({ priceCents, commissionRate })

  const [order] = await db
    .insert(orders)
    .values({
      leadId: id,
      customerId: customer.id,
      affiliateId,
      package: input.package.trim(),
      priceCents,
      supplierPayoutCents: money.supplierPayoutCents,
      profitCents: money.profitCents,
      commissionCents: money.commissionCents,
      netProfitCents: money.netProfitCents,
      paymentMethod: input.paymentMethod,
      paymentStatus: 'paid',
      paidAt: new Date(),
      status: 'paid',
    })
    .returning()

  await db.update(leads).set({ status: 'won' }).where(eq(leads.id, id))

  await createDeliveryTaskForOrder(order.id) // rule 3
  await recomputeOrderRollups(order.id) // rules 7 & 8

  revalidatePath('/tickets')
  revalidatePath(`/tickets/${id}`)
  revalidatePath('/orders')
  redirect(`/orders/${order.id}`)
}
