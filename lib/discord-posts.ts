import { gte } from 'drizzle-orm'
import { db } from './db'
import { leads, orders, commissions } from './db/schema'
import { postToChannel } from './discord'
import { getLeaderboard } from './queries/leaderboard'
import { formatCents } from './money'
import { sendPush } from './push'

// Coach-facing channel for leaderboard + payout proofs (#＄・affiliates-program).
function affiliateChannel(): string | null {
  return process.env.AFFILIATE_CHANNEL_ID || null
}

// Private staff channel for sale/payment/refund notifications (spec §25).
function adminChannel(): string | null {
  return process.env.ADMIN_NOTIFY_CHANNEL_ID || process.env.STAFF_CHANNEL_ID || null
}

// Public channel where happy buyers leave reviews. When set, the post-sale
// vouch prompt links straight to it; otherwise it just names "the vouches channel".
function vouchesChannel(): string | null {
  return process.env.VOUCHES_CHANNEL_ID || null
}

/**
 * Auto-prompt the buyer for a review in their own ticket, right after their
 * deal is completed, so it happens on every sale without staff doing anything.
 * Best-effort: a failure here never blocks completing the deal.
 */
export async function postVouchRequest(
  ticketChannelId: string | null | undefined,
): Promise<boolean> {
  if (!ticketChannelId) return false
  const vch = vouchesChannel()
  const where = vch ? `in <#${vch}>` : 'in the vouches channel'
  try {
    return await postToChannel(ticketChannelId, {
      embeds: [
        {
          title: '⭐ Enjoying your account?',
          description:
            `Thanks for your order! If you're happy with it, dropping a quick review ${where} would mean a lot — it helps other buyers trust the shop.\n\n` +
            'A short screen recording or a couple of lines of text both work. Appreciate you!',
          color: 0xf5c542,
        },
        {
          title: '💸 Earn $100 per referral',
          description:
            'If you know anyone else who needs one, you can make $100 for every completed referral. Just ask a team member here and we will set you up with your own referral link.',
          color: 0x22c55e,
        },
      ],
    })
  } catch {
    return false
  }
}

/** Post the sales panel (buttons that open a ticket) to a public channel (spec §3). */
export async function postSalesPanel(channelId: string): Promise<boolean> {
  return postToChannel(channelId, {
    embeds: [
      {
        title: '🛍️ Open a ticket',
        description:
          'Pick what you need below and a private ticket opens just for you.\n\n' +
          '🛒 **Buy an account** · 📦 **Bulk order** · 🛟 **Support** · 🤝 **Become a partner** · ❓ **Other**',
        color: 0x2f66e6,
      },
    ],
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 3, label: 'Buy Account', emoji: { name: '🛒' }, custom_id: 'panel:buy' },
          { type: 2, style: 1, label: 'Bulk Order', emoji: { name: '📦' }, custom_id: 'panel:bulk' },
          { type: 2, style: 2, label: 'Support', emoji: { name: '🛟' }, custom_id: 'panel:support' },
        ],
      },
      {
        type: 1,
        components: [
          { type: 2, style: 2, label: 'Become a Partner', emoji: { name: '🤝' }, custom_id: 'panel:partner' },
          { type: 2, style: 2, label: 'Other', emoji: { name: '❓' }, custom_id: 'panel:other' },
        ],
      },
    ],
  })
}

/** Daily sales report to the private admin channel (spec §26). */
export async function postDailyReport(): Promise<boolean> {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const [allLeads, allOrders, ledger] = await Promise.all([
    db.select().from(leads).where(gte(leads.createdAt, start)),
    db.select().from(orders),
    db.select().from(commissions).where(gte(commissions.createdAt, start)),
  ])
  const completedToday = allOrders.filter((o) => o.paidAt && new Date(o.paidAt) >= start && o.paymentStatus === 'paid')
  const revenueToday = completedToday.reduce((s, o) => s + o.priceCents, 0)
  const referralSales = completedToday.filter((o) => o.sourceCoachId).length
  const openDeals = allLeads // created today; plus overall open
  const commissionsToday = ledger.length
  return postAdminNotify(
    '📊 Daily report',
    [
      `New tickets: ${allLeads.length}`,
      `Completed sales: ${completedToday.length}`,
      `Revenue: ${formatCents(revenueToday)}`,
      `Referral sales: ${referralSales}`,
      `Commissions created: ${commissionsToday}`,
      `New deals opened: ${openDeals.length}`,
    ],
    0x2f66e6
  )
}

/** Post an event notification to the private admin channel. */
export async function postAdminNotify(
  title: string,
  lines: string[],
  color = 0x3b82f6
): Promise<boolean> {
  const ok = await postToChannel(adminChannel(), {
    embeds: [{ title, description: lines.filter(Boolean).join('\n'), color }],
  })
  // Also buzz the owner's installed CRM app (no-op until push is set up).
  await sendPush({ title, body: lines.filter(Boolean).join(' · ').slice(0, 180) })
  return ok
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
