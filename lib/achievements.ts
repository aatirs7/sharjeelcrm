import { eq, inArray } from 'drizzle-orm'
import { db } from './db'
import { coaches, commissions, coachAchievements } from './db/schema'
import { postToChannel } from './discord'
import { postAdminNotify } from './discord-posts'

// Confirmed-buyer milestones (spec §19).
export const ACHIEVEMENTS: { key: string; label: string; threshold: number }[] = [
  { key: 'first_sale', label: 'First Sale', threshold: 1 },
  { key: 'five', label: '5 Sales', threshold: 5 },
  { key: 'ten', label: '10 Sales', threshold: 10 },
  { key: 'twenty_five', label: '25 Sales', threshold: 25 },
  { key: 'fifty', label: '50 Sales', threshold: 50 },
  { key: 'hundred', label: '100 Sales', threshold: 100 },
]

export const achievementLabel = (key: string) => ACHIEVEMENTS.find((a) => a.key === key)?.label ?? key

/**
 * Unlock achievements from each coach's confirmed-buyer count (commissions that
 * reached approved/paid). Idempotent; announces only newly-unlocked ones. Runs
 * in the daily cron. Returns how many new achievements were unlocked.
 */
export async function assignAchievements(): Promise<number> {
  const [coachRows, ledger, existing] = await Promise.all([
    db.select().from(coaches),
    db.select().from(commissions),
    db.select().from(coachAchievements),
  ])
  const confirmed = new Map<string, number>()
  for (const c of ledger) {
    if (c.status === 'approved' || c.status === 'paid')
      confirmed.set(c.coachId, (confirmed.get(c.coachId) ?? 0) + 1)
  }
  const have = new Set(existing.map((e) => `${e.coachId}:${e.key}`))

  let unlocked = 0
  for (const coach of coachRows) {
    const n = confirmed.get(coach.id) ?? 0
    for (const a of ACHIEVEMENTS) {
      if (n >= a.threshold && !have.has(`${coach.id}:${a.key}`)) {
        const res = await db
          .insert(coachAchievements)
          .values({ coachId: coach.id, key: a.key })
          .onConflictDoNothing({ target: [coachAchievements.coachId, coachAchievements.key] })
          .returning({ id: coachAchievements.id })
        if (res.length) {
          unlocked++
          await postAdminNotify('🏅 Achievement unlocked', [`${coach.name} — ${a.label}`], 0xf59e0b)
          if (process.env.AFFILIATE_CHANNEL_ID) {
            await postToChannel(process.env.AFFILIATE_CHANNEL_ID, {
              embeds: [{ title: '🏅 Achievement unlocked', description: `**${coach.name}** earned **${a.label}**!`, color: 0xf59e0b }],
            })
          }
        }
      }
    }
  }
  return unlocked
}

/** A coach's unlocked achievement keys. */
export async function getCoachAchievements(coachId: string): Promise<string[]> {
  const rows = await db.select().from(coachAchievements).where(eq(coachAchievements.coachId, coachId))
  return rows.map((r) => r.key)
}

export async function getAchievementsFor(coachIds: string[]): Promise<Map<string, string[]>> {
  if (coachIds.length === 0) return new Map()
  const rows = await db.select().from(coachAchievements).where(inArray(coachAchievements.coachId, coachIds))
  const m = new Map<string, string[]>()
  for (const r of rows) m.set(r.coachId, [...(m.get(r.coachId) ?? []), r.key])
  return m
}
