import { eq } from 'drizzle-orm'
import { db } from './db'
import { fraudFlags, orders, leads, coaches, customers, auditLogs } from './db/schema'

const DAY = 86_400_000

async function flag(input: {
  type: string
  detail: string
  refKey: string
  coachId?: string | null
  customerId?: string | null
}): Promise<boolean> {
  const res = await db
    .insert(fraudFlags)
    .values({
      type: input.type,
      detail: input.detail,
      refKey: input.refKey,
      coachId: input.coachId ?? null,
      customerId: input.customerId ?? null,
    })
    .onConflictDoNothing({ target: fraudFlags.refKey })
    .returning({ id: fraudFlags.id })
  return res.length > 0
}

/**
 * Scan for suspicious referral activity (spec §29). Creates review flags only —
 * never auto-bans. Idempotent via refKey so the daily run doesn't duplicate.
 * Returns how many new flags were raised.
 */
export async function scanFraud(): Promise<number> {
  let created = 0
  const now = Date.now()

  const [allLeads, coachRows, allOrders, custRows] = await Promise.all([
    db.select().from(leads),
    db.select().from(coaches),
    db.select().from(orders),
    db.select().from(customers),
  ])
  const coachById = new Map(coachRows.map((c) => [c.id, c]))
  const leadById = new Map(allLeads.map((l) => [l.id, l]))

  // 1) Self-referral: buyer is the coach they were attributed to.
  for (const o of allOrders) {
    if (!o.sourceCoachId || !o.leadId) continue
    const lead = leadById.get(o.leadId)
    const coach = coachById.get(o.sourceCoachId)
    if (!lead || !coach) continue
    const same =
      (lead.discordUserId && coach.discordUserId && lead.discordUserId === coach.discordUserId) ||
      (lead.discordUsername && coach.discordUsername &&
        lead.discordUsername.toLowerCase() === coach.discordUsername.toLowerCase())
    if (same) {
      if (await flag({ type: 'self_referral', detail: `${coach.name} credited on their own purchase (DEAL-${lead.dealNumber})`, refKey: `self:${o.id}`, coachId: coach.id })) created++
    }
  }

  // 2) Duplicate Discord id across different usernames.
  const byDiscordId = new Map<string, Set<string>>()
  for (const l of allLeads) {
    if (!l.discordUserId) continue
    const set = byDiscordId.get(l.discordUserId) ?? new Set()
    set.add(l.discordUsername)
    byDiscordId.set(l.discordUserId, set)
  }
  for (const [uid, names] of byDiscordId) {
    if (names.size > 1) {
      if (await flag({ type: 'duplicate_id', detail: `Discord id ${uid} used by ${names.size} usernames: ${[...names].join(', ')}`, refKey: `dupid:${uid}` })) created++
    }
  }

  // 3) Rapid referrals: a coach credited on many new leads in the last 24h.
  const dayAgo = new Date(now - DAY)
  const recentByCoach = new Map<string, number>()
  for (const l of allLeads) {
    if (l.sourceCoachId && l.createdAt && new Date(l.createdAt) >= dayAgo)
      recentByCoach.set(l.sourceCoachId, (recentByCoach.get(l.sourceCoachId) ?? 0) + 1)
  }
  const bucket = new Date().toISOString().slice(0, 10)
  for (const [coachId, n] of recentByCoach) {
    if (n >= 6) {
      const coach = coachById.get(coachId)
      if (await flag({ type: 'rapid_referrals', detail: `${coach?.name ?? coachId} had ${n} attributed leads in 24h`, refKey: `rapid:${coachId}:${bucket}`, coachId })) created++
    }
  }

  // 4) Repeat refunder: customer with 2+ refunded/chargeback orders.
  const refundsByCustomer = new Map<string, number>()
  for (const o of allOrders) {
    if (o.paymentStatus === 'refunded' || o.paymentStatus === 'chargeback')
      refundsByCustomer.set(o.customerId, (refundsByCustomer.get(o.customerId) ?? 0) + 1)
  }
  const custName = new Map(custRows.map((c) => [c.id, c.discordUsername]))
  for (const [customerId, n] of refundsByCustomer) {
    if (n >= 2) {
      if (await flag({ type: 'repeat_refunder', detail: `${custName.get(customerId) ?? customerId} has ${n} refunds/chargebacks`, refKey: `refunder:${customerId}`, customerId })) created++
    }
  }

  // 5) Attribution churn: an order whose referral was changed 2+ times.
  const churn = new Map<string, number>()
  const changes = await db.select().from(auditLogs).where(eq(auditLogs.action, 'referral.change'))
  for (const a of changes) {
    const oid = (a.meta as { orderId?: string } | null)?.orderId
    if (oid) churn.set(oid, (churn.get(oid) ?? 0) + 1)
  }
  for (const [orderId, n] of churn) {
    if (n >= 2) {
      if (await flag({ type: 'attribution_churn', detail: `Referral changed ${n} times on one order`, refKey: `churn:${orderId}` })) created++
    }
  }

  return created
}
