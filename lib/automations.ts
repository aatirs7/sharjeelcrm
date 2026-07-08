/**
 * Automation hooks — fired from server actions on the relevant mutation.
 * See the spec's "Automations" section (rules 1–8). Each rule is a small,
 * idempotent function invoked inline; no external queue.
 *
 * This module grows across milestones:
 *   M3: rule 2 (payment_pending -> follow_up task)   [here]
 *   M4/M5: rules 3, 5 (order/delivery tasks, auto-complete)
 *   M6: rules 7, 8 (customer / affiliate rollups)
 *   M8: rule 6 (warranty expiry — daily cron)
 */
import { and, eq } from 'drizzle-orm'
import { db } from './db'
import { leads, tasks } from './db/schema'

const HOUR = 3_600_000

/**
 * Rule 2 — a lead entering `payment_pending` gets a follow-up task due in 24h,
 * assigned to the lead's rep. Skips creation if an open follow-up already exists
 * for this lead so repeated status toggles don't pile up duplicates.
 */
export async function createFollowUpTaskForLead(leadId: string): Promise<void> {
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) })
  if (!lead) return

  const existing = await db.query.tasks.findFirst({
    where: and(eq(tasks.leadId, leadId), eq(tasks.type, 'follow_up'), eq(tasks.status, 'open')),
  })
  if (existing) return

  await db.insert(tasks).values({
    type: 'follow_up',
    title: `Follow up on payment (${lead.discordUsername})`,
    dueAt: new Date(Date.now() + 24 * HOUR),
    leadId: lead.id,
    assignedRepId: lead.assignedRepId,
  })
}
