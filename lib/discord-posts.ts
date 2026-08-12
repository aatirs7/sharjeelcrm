import { postToChannel } from './discord'
import { getLeaderboard } from './queries/leaderboard'
import { formatCents } from './money'

// Coach-facing channel for leaderboard + payout proofs (#＄・affiliates-program).
function affiliateChannel(): string | null {
  return process.env.AFFILIATE_CHANNEL_ID || null
}

/** Announce a paid payout in the affiliates channel. */
export async function postPayoutProof(input: {
  coachName: string
  amountCents: number
  buyerCount: number
  method?: string | null
  ref?: string | null
}): Promise<boolean> {
  const lines = [
    `**${input.coachName}** was paid **${formatCents(input.amountCents)}** for ${input.buyerCount} confirmed buyer${input.buyerCount === 1 ? '' : 's'}.`,
  ]
  if (input.method) lines.push(`Method: ${input.method}`)
  if (input.ref) lines.push(`Ref: ${input.ref}`)
  return postToChannel(affiliateChannel(), {
    embeds: [{ title: '💸 Payout sent', description: lines.join('\n'), color: 0x22c55e }],
  })
}

/** Post the current weekly leaderboard (top 10 by confirmed buyers this week). */
export async function postWeeklyLeaderboard(): Promise<boolean> {
  const rows = (await getLeaderboard()).filter((r) => r.weeklyBuyers > 0).slice(0, 10)
  if (rows.length === 0) return false
  const medals = ['🥇', '🥈', '🥉']
  const body = rows
    .map((r, i) => `${medals[i] ?? `**${i + 1}.**`} ${r.name} — ${r.weeklyBuyers} buyer${r.weeklyBuyers === 1 ? '' : 's'} (${r.tier})`)
    .join('\n')
  return postToChannel(affiliateChannel(), {
    embeds: [
      {
        title: '🏆 Weekly leaderboard',
        description: `Top coaches by confirmed buyers this week:\n\n${body}`,
        color: 0xf59e0b,
      },
    ],
  })
}
