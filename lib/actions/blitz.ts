'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { blitzLedger } from '../db/schema'
import { requireAdmin } from '../auth'
import { logAudit } from '../audit'
import { setSetting } from '../settings'
import { formatCents } from '../money'

function refresh() {
  revalidatePath('/')
  revalidatePath('/revenue')
}

/** A YYYY-MM-DD from the form, as an instant: today means now, a past day means midday. */
function whenFrom(day: string | null | undefined): Date {
  const now = new Date()
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return now
  const at = new Date(`${day}T12:00:00`)
  if (Number.isNaN(at.getTime()) || at > now) return now
  const today = now.toISOString().slice(0, 10)
  return day === today ? now : at
}

function cents(amount: number): number {
  const c = Math.round(amount)
  if (!Number.isFinite(c) || c < 0 || c > 100_000_000) throw new Error('Enter a valid amount')
  return c
}

/** Admin: record money taken out of Blitz (to the bank). */
export async function recordBlitzWithdrawal(input: { amountCents: number; day?: string; note?: string }) {
  const rep = await requireAdmin()
  const amountCents = cents(input.amountCents)
  if (amountCents === 0) throw new Error('Enter the amount withdrawn')
  await db.insert(blitzLedger).values({
    kind: 'withdrawal',
    amountCents,
    occurredAt: whenFrom(input.day),
    note: input.note?.trim() || null,
    createdBy: rep.id,
  })
  await logAudit({
    action: 'blitz.withdrawal',
    entity: 'blitz',
    summary: `Recorded a Blitz withdrawal of ${formatCents(amountCents)}`,
  })
  refresh()
}

/** Admin: record the balance Blitz shows right now. Resets the running balance. */
export async function recordBlitzBalanceCheck(input: { amountCents: number; note?: string }) {
  const rep = await requireAdmin()
  const amountCents = cents(input.amountCents)
  await db.insert(blitzLedger).values({
    kind: 'balance_check',
    amountCents,
    occurredAt: new Date(),
    note: input.note?.trim() || null,
    createdBy: rep.id,
  })
  await logAudit({
    action: 'blitz.balance_check',
    entity: 'blitz',
    summary: `Matched the Blitz balance to ${formatCents(amountCents)}`,
  })
  refresh()
}

/** Admin: remove a ledger entry entered by mistake. */
export async function deleteBlitzLedgerEntry(id: string) {
  await requireAdmin()
  const [row] = await db.delete(blitzLedger).where(eq(blitzLedger.id, id)).returning()
  if (row) {
    await logAudit({
      action: 'blitz.ledger_delete',
      entity: 'blitz',
      summary: `Removed a Blitz ${row.kind === 'withdrawal' ? 'withdrawal' : 'balance check'} of ${formatCents(row.amountCents)}`,
    })
  }
  refresh()
}

/** Admin: Blitz's fee per sale, in basis points (290 = 2.90%). */
export async function saveBlitzFee(bps: number) {
  await requireAdmin()
  const v = Math.round(bps)
  if (!Number.isFinite(v) || v < 0 || v > 2000) throw new Error('Fee must be between 0% and 20%')
  await setSetting('blitzFeeBps', v)
  await logAudit({ action: 'blitz.fee', entity: 'blitz', summary: `Blitz fee set to ${(v / 100).toFixed(2)}%` })
  refresh()
}
