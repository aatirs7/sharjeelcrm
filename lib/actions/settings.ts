'use server'

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '../auth'
import { setSetting, type CryptoAddress } from '../settings'
import { setBotAvatar } from '../discord'
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

/**
 * Wallet addresses the Discord bot hands to buyers who choose to pay in
 * crypto. Blank rows are dropped; coin symbols are upper-cased.
 */
export async function saveCryptoAddresses(input: CryptoAddress[]): Promise<void> {
  await requireAdmin()
  const clean: CryptoAddress[] = []
  for (const row of input.slice(0, 20)) {
    const coin = String(row.coin ?? '').trim().toUpperCase().slice(0, 12)
    const network = String(row.network ?? '').trim().slice(0, 40)
    const address = String(row.address ?? '').trim().slice(0, 200)
    if (!address) continue
    if (!coin) throw new Error('Each wallet needs a coin (e.g. BTC)')
    clean.push({ coin, network, address })
  }
  await setSetting('cryptoAddresses', clean)
  await logAudit({
    action: 'settings.crypto',
    entity: 'settings',
    summary: `Updated crypto wallets (${clean.length} saved)`,
    meta: { coins: clean.map((c) => c.coin) },
  })
  revalidatePath('/settings')
}

const AVATAR_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif'])
const AVATAR_MAX_BYTES = 10 * 1024 * 1024

/**
 * Set the Discord bot's profile picture. With no file it applies the shipped
 * brand logo (public/bot-avatar.png); with a file (png / jpg / gif) it uses that.
 */
export async function applyBotAvatar(formData?: FormData): Promise<{ avatarUrl: string | null }> {
  await requireAdmin()
  const file = formData?.get('avatar')
  let bytes: Uint8Array
  let mime: string
  let source: string
  if (file instanceof File && file.size > 0) {
    if (!AVATAR_MIMES.has(file.type)) throw new Error('Use a PNG, JPG or GIF image')
    if (file.size > AVATAR_MAX_BYTES) throw new Error('Image must be under 10 MB')
    bytes = new Uint8Array(await file.arrayBuffer())
    mime = file.type
    source = file.name
  } else {
    bytes = await readFile(path.join(process.cwd(), 'public', 'bot-avatar.png'))
    mime = 'image/png'
    source = 'brand logo'
  }
  const profile = await setBotAvatar(bytes, mime)
  await logAudit({
    action: 'settings.bot_avatar',
    entity: 'settings',
    summary: `Changed the Discord bot profile picture (${source})`,
  })
  revalidatePath('/settings')
  return { avatarUrl: profile.avatarUrl }
}
