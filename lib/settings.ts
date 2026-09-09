import { eq } from 'drizzle-orm'
import { db } from './db'
import { settings } from './db/schema'

/**
 * Configurable business rules (spec §17/§30/§40). Stored one row per key with a
 * JSON value; defaults below apply until an admin overrides them.
 */
export interface AppSettings {
  // Monthly leaderboard rewards, in cents, for ranks 1/2/3.
  leaderboardRewards: { first: number; second: number; third: number }
  // Repeat-customer commission: 'first_only' pays the coach on the customer's
  // first completed purchase only; 'every_purchase' pays on every one.
  repeatCommission: 'first_only' | 'every_purchase'
}

export const DEFAULT_SETTINGS: AppSettings = {
  leaderboardRewards: { first: 0, second: 0, third: 0 },
  repeatCommission: 'first_only',
}

export async function getSettings(): Promise<AppSettings> {
  const rows = await db.select().from(settings)
  const map = new Map(rows.map((r) => [r.key, r.value]))
  return {
    leaderboardRewards:
      (map.get('leaderboardRewards') as AppSettings['leaderboardRewards']) ??
      DEFAULT_SETTINGS.leaderboardRewards,
    repeatCommission:
      (map.get('repeatCommission') as AppSettings['repeatCommission']) ??
      DEFAULT_SETTINGS.repeatCommission,
  }
}

export async function getSetting<K extends keyof AppSettings>(key: K): Promise<AppSettings[K]> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key))
  return (row?.value as AppSettings[K]) ?? DEFAULT_SETTINGS[key]
}

export async function setSetting<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K]
): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
}
