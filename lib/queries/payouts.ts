import { desc, eq } from 'drizzle-orm'
import { db } from '../db'
import { coaches, commissions, payouts } from '../db/schema'

export interface CoachPayoutRow {
  coachId: string
  name: string
  promoCode: string | null
  payoutMethod: string | null
  pendingCents: number // approved but not yet paid (payable now)
  pendingCount: number
  heldCents: number // still inside the 7-day hold (pending status)
  heldCount: number
  paidCents: number // lifetime paid out
}

export interface PayoutHistoryRow {
  id: string
  coachName: string
  periodStart: string | null
  periodEnd: string | null
  buyerCount: number
  totalCents: number
  status: string
  paidAt: Date | null
  method: string | null
  transactionRef: string | null
}

/** Per-coach payable/held/paid totals from the commission ledger. */
export async function getPayoutSummary(): Promise<{
  coaches: CoachPayoutRow[]
  history: PayoutHistoryRow[]
}> {
  const [coachRows, ledger, payoutRows] = await Promise.all([
    db.select().from(coaches),
    db.select().from(commissions),
    db.select().from(payouts).orderBy(desc(payouts.createdAt)),
  ])

  const coachName = new Map(coachRows.map((c) => [c.id, c.name]))

  const rows: CoachPayoutRow[] = coachRows.map((c) => {
    const mine = ledger.filter((l) => l.coachId === c.id)
    const payable = mine.filter((l) => l.status === 'approved' && l.payoutId == null)
    const held = mine.filter((l) => l.status === 'pending')
    const paid = mine.filter((l) => l.status === 'paid')
    return {
      coachId: c.id,
      name: c.name,
      promoCode: c.promoCode,
      payoutMethod: c.payoutMethod,
      pendingCents: payable.reduce((s, l) => s + l.amountCents, 0),
      pendingCount: payable.length,
      heldCents: held.reduce((s, l) => s + l.amountCents, 0),
      heldCount: held.length,
      paidCents: paid.reduce((s, l) => s + l.amountCents, 0),
    }
  })
  // Coaches with money in play first.
  rows.sort((a, b) => b.pendingCents - a.pendingCents || b.paidCents - a.paidCents)

  const history: PayoutHistoryRow[] = payoutRows.map((p) => ({
    id: p.id,
    coachName: coachName.get(p.coachId) ?? '—',
    periodStart: p.periodStart,
    periodEnd: p.periodEnd,
    buyerCount: p.buyerCount,
    totalCents: p.totalCents,
    status: p.status,
    paidAt: p.paidAt,
    method: p.method,
    transactionRef: p.transactionRef,
  }))

  return { coaches: rows, history }
}

/** Recent payouts for a single coach (used on the coach dashboard, M4). */
export async function getCoachPayouts(coachId: string): Promise<PayoutHistoryRow[]> {
  const rows = await db
    .select()
    .from(payouts)
    .where(eq(payouts.coachId, coachId))
    .orderBy(desc(payouts.createdAt))
  return rows.map((p) => ({
    id: p.id,
    coachName: '',
    periodStart: p.periodStart,
    periodEnd: p.periodEnd,
    buyerCount: p.buyerCount,
    totalCents: p.totalCents,
    status: p.status,
    paidAt: p.paidAt,
    method: p.method,
    transactionRef: p.transactionRef,
  }))
}
