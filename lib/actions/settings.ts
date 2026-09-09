'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '../auth'
import { setSetting } from '../settings'
import { logAudit } from '../audit'

export async function saveLeaderboardRewards(input: {
  first: number | string
  second: number | string
  third: number | string
}): Promise<void> {
  await requireAdmin()
  const cents = (v: number | string) => Math.max(0, Math.round((Number(v) || 0) * 100))
  const rewards = { first: cents(input.first), second: cents(input.second), third: cents(input.third) }
  await setSetting('leaderboardRewards', rewards)
  await logAudit({ action: 'settings.rewards', entity: 'settings', summary: 'Updated leaderboard rewards', meta: rewards })
  revalidatePath('/settings')
  revalidatePath('/leaderboard')
}

export async function saveRepeatCommission(mode: 'first_only' | 'every_purchase'): Promise<void> {
  await requireAdmin()
  await setSetting('repeatCommission', mode)
  await logAudit({ action: 'settings.repeat', entity: 'settings', summary: `Repeat-customer commission → ${mode}` })
  revalidatePath('/settings')
}
