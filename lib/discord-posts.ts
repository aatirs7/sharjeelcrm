import { and, eq, gt, gte, isNotNull, isNull, lte } from 'drizzle-orm'
import { db } from './db'
import { leads, orders, commissions } from './db/schema'
import { dget, dpost, postToChannel } from './discord'
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

/** The post-sale review + referral prompt, shared by the delayed sender. */
function vouchEmbeds(): unknown[] {
  const vch = vouchesChannel()
  const where = vch ? `in <#${vch}>` : 'in the vouches channel'
  return [
    {
      title: '⭐ How is the account treating you?',
      description:
        `Hope everything is running smooth with your account! If you're happy with it, dropping a quick review ${where} would mean a lot — it helps other buyers trust the shop.\n\n` +
        'A short screen recording or a couple of lines of text both work. Appreciate you!',
      color: 0xf5c542,
    },
    {
      title: '💸 Earn $100 per referral',
      description:
        'If you know anyone else who needs one, you can make $100 for every completed referral. Just ask a team member here and we will set you up with your own referral link.',
      color: 0x22c55e,
    },
  ]
}

/**
 * Deliver the vouch prompt to a buyer. Prefers their ticket channel while it is
 * still open; if the ticket was closed (Ticket Tool renames it `closed-*`) or
 * deleted, falls back to a direct message so the prompt still lands. Returns
 * true only if it reached one of the two.
 */
async function deliverVouch(
  channelId: string | null,
  userId: string | null,
): Promise<boolean> {
  const embeds = vouchEmbeds()
  if (channelId) {
    try {
      const ch = await dget<{ name?: string }>(`/channels/${channelId}`)
      if (!/^closed-/i.test(ch?.name ?? '')) {
        if (await postToChannel(channelId, { embeds })) return true
      }
    } catch {
      // 404 / gone — fall through to the DM path.
    }
  }
  if (userId) {
    try {
      const res = await dpost('/users/@me/channels', { recipient_id: userId })
      if (res.ok) {
        const dm = (await res.json()) as { id?: string }
        if (dm?.id) return await postToChannel(dm.id, { embeds })
      }
    } catch {
      return false
    }
  }
  return false
}

/**
 * Send the review + referral prompt for deals that completed a couple of days
 * ago and have not been prompted yet. Called from the daily sweep, so the real
 * gap is VOUCH_DELAY_DAYS to that plus a day — which is the "2-3 days after the
 * deal" the client asked for. Per-order best-effort; a Discord hiccup on one
 * leaves it pending for the next run. A 14-day floor stops a permanently
 * failing post from retrying forever, and `isNotNull(vouchDueAt)` keeps orders
 * from before this change (which already got the old instant prompt) out.
 */
export async function postDueVouchRequests(): Promise<{ posted: number; eligible: number }> {
  const now = new Date()
  const floor = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
  const due = await db
    .select({
      orderId: orders.id,
      channelId: leads.discordChannelId,
      userId: leads.discordUserId,
    })
    .from(orders)
    .innerJoin(leads, eq(orders.leadId, leads.id))
    .where(
      and(
        isNotNull(orders.vouchDueAt),
        lte(orders.vouchDueAt, now),
        gt(orders.vouchDueAt, floor),
        isNull(orders.vouchPostedAt),
      ),
    )
    .limit(25)

  let posted = 0
  for (const row of due) {
    let ok = false
    try {
      ok = await deliverVouch(row.channelId, row.userId)
    } catch {
      ok = false
    }
    if (ok) {
      await db.update(orders).set({ vouchPostedAt: new Date() }).where(eq(orders.id, row.orderId))
      posted += 1
    }
  }
  return { posted, eligible: due.length }
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
