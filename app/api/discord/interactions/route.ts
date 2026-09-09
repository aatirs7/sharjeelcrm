import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { applyTicketTag, type TicketTag } from '@/lib/ticket-tag'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { leads, products, reps } from '@/lib/db/schema'
import { createTicketChannel, postToChannel } from '@/lib/discord'
import { ingestTicketLead } from '@/lib/leads-ingest'
import { postAdminNotify } from '@/lib/discord-posts'
import { createOrderForLead } from '@/lib/deal'
import { formatCents } from '@/lib/money'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Discord interaction + response type constants.
const PING = 1
const MESSAGE_COMPONENT = 3
const PONG = 1
const UPDATE_MESSAGE = 7
const EPHEMERAL = 64
const MANAGE_CHANNELS = BigInt(16) // 1 << 4

const SPKI_ED25519_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

/** Verify Discord's Ed25519 request signature (no external deps). */
function verify(publicKeyHex: string, signatureHex: string, timestamp: string, body: string): boolean {
  try {
    const key = crypto.createPublicKey({
      key: Buffer.concat([SPKI_ED25519_PREFIX, Buffer.from(publicKeyHex, 'hex')]),
      format: 'der',
      type: 'spki',
    })
    return crypto.verify(
      null,
      Buffer.from(timestamp + body),
      key,
      Buffer.from(signatureHex, 'hex')
    )
  } catch {
    return false
  }
}

const TAG_LABEL: Record<TicketTag, string> = {
  purchase: '🛒 Purchase',
  support: '🛟 Support',
  question: '❓ Question',
}

// Sales-panel button config: label, welcome copy, CRM ticket type + route tag.
const PANEL = {
  buy: { label: 'purchase', welcome: 'thanks for your interest in a TikTok Shop account!', ticketType: 'purchase' as const, route: 'SHOP' },
  bulk: { label: 'bulk order', welcome: 'thanks for your interest in a bulk order!', ticketType: 'purchase' as const, route: 'BUNDLE' },
  support: { label: 'support', welcome: 'how can we help with your existing order?', ticketType: 'support' as const, route: 'SUPPORT' },
  partner: { label: 'partner', welcome: 'thanks for your interest in becoming a referral partner!', ticketType: 'question' as const, route: 'PARTNER' },
  other: { label: 'question', welcome: 'thanks for reaching out!', ticketType: 'question' as const, route: 'SHOP' },
}

/** Post the ticket controls: a product picker (buyer) + staff action buttons. */
async function postTicketControls(channelId: string): Promise<void> {
  const list = await db.select().from(products).where(eq(products.active, true)).limit(25)
  const rows: unknown[] = []
  if (list.length) {
    rows.push({
      type: 1,
      components: [
        {
          type: 3, // string select
          custom_id: `product:${channelId}`,
          placeholder: 'Select a product',
          options: list.map((p) => ({
            label: `${p.name} — ${formatCents(p.priceCents)}`.slice(0, 100),
            value: p.id,
          })),
        },
      ],
    })
  }
  rows.push({
    type: 1,
    components: [
      { type: 2, style: 1, label: 'Claim', emoji: { name: '🙋' }, custom_id: `deal:claim:${channelId}` },
      { type: 2, style: 2, label: 'Mark Paid', emoji: { name: '💳' }, custom_id: `deal:paid:${channelId}` },
      { type: 2, style: 3, label: 'Mark Completed', emoji: { name: '✅' }, custom_id: `deal:complete:${channelId}` },
    ],
  })
  await postToChannel(channelId, {
    embeds: [
      {
        title: 'Ticket controls',
        description: 'Buyer: pick your product above. Staff: claim and progress the deal below.',
        color: 0x2f66e6,
      },
    ],
    components: rows,
  })
}

const MANAGE = BigInt(16)
const isStaff = (interaction: { member?: { permissions?: string } }) =>
  (BigInt(interaction.member?.permissions ?? '0') & MANAGE) === MANAGE

export async function POST(req: Request): Promise<NextResponse> {
  const publicKey = process.env.DISCORD_PUBLIC_KEY
  const signature = req.headers.get('x-signature-ed25519')
  const timestamp = req.headers.get('x-signature-timestamp')
  const raw = await req.text()

  if (!publicKey || !signature || !timestamp || !verify(publicKey, signature, timestamp, raw)) {
    return new NextResponse('invalid request signature', { status: 401 })
  }

  const interaction = JSON.parse(raw)

  if (interaction.type === PING) {
    return NextResponse.json({ type: PONG })
  }

  if (interaction.type === MESSAGE_COMPONENT) {
    const customId: string = interaction.data?.custom_id ?? ''

    // Sales panel (spec §3): a buyer clicks a panel button -> open a private
    // ticket channel + seed the deal card.
    if (customId.startsWith('panel:')) {
      const kind = customId.split(':')[1] as keyof typeof PANEL
      const cfg = PANEL[kind] ?? PANEL.other
      const guildId = interaction.guild_id
      const user = interaction.member?.user ?? interaction.user
      if (!guildId || !user?.id) {
        return NextResponse.json({ type: 4, data: { content: 'Could not open a ticket.', flags: EPHEMERAL } })
      }
      const safe = String(user.username || 'buyer').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20)
      const channelId = await createTicketChannel(guildId, user.id, `ticket-${safe}`)
      if (!channelId) {
        return NextResponse.json({ type: 4, data: { content: 'Could not create your ticket, please ping staff.', flags: EPHEMERAL } })
      }
      const link = `https://discord.com/channels/${guildId}/${channelId}`
      await postToChannel(channelId, {
        content: `<@${user.id}> ${cfg.welcome}\n\nIf you have a **referral or promo code**, drop it here and a team member will be with you shortly.`,
      })
      await ingestTicketLead({
        discordUsername: user.username ?? 'buyer',
        discordUserId: user.id,
        discordChannelId: channelId,
        ticketLink: link,
        source: 'discord',
        ticketType: cfg.ticketType,
        routeCategory: cfg.route,
      })
      await postAdminNotify(
        '🎫 New ticket',
        [`Type: ${cfg.label}`, `Customer: ${user.username ?? user.id}`, `Channel: <#${channelId}>`],
        0x3b82f6
      )
      await postTicketControls(channelId)
      return NextResponse.json({
        type: 4,
        data: { content: `Your ${cfg.label} ticket is ready: <#${channelId}>`, flags: EPHEMERAL },
      })
    }

    // Buyer picks a product from the ticket menu (spec §31).
    if (customId.startsWith('product:')) {
      const channelId = customId.split(':')[1]
      const productId = interaction.data?.values?.[0]
      const product = productId ? await db.query.products.findFirst({ where: eq(products.id, productId) }) : null
      if (product) {
        await db
          .update(leads)
          .set({ productId: product.id })
          .where(eq(leads.discordChannelId, channelId))
      }
      return NextResponse.json({
        type: 4,
        data: { content: product ? `Selected **${product.name}** (${formatCents(product.priceCents)}).` : 'Not found.', flags: EPHEMERAL },
      })
    }

    // Staff deal actions from inside the ticket (spec §41/§49).
    if (customId.startsWith('deal:')) {
      const [, action, channelId] = customId.split(':')
      if (!isStaff(interaction)) {
        return NextResponse.json({ type: 4, data: { content: 'Staff only.', flags: EPHEMERAL } })
      }
      const lead = await db.query.leads.findFirst({ where: eq(leads.discordChannelId, channelId) })
      if (!lead) {
        return NextResponse.json({ type: 4, data: { content: 'No deal is linked to this ticket.', flags: EPHEMERAL } })
      }
      const clicker = interaction.member?.user ?? interaction.user
      const firstResp = lead.firstResponseAt ? {} : { firstResponseAt: new Date() }

      if (action === 'claim') {
        const rep = clicker?.id
          ? await db.query.reps.findFirst({ where: and(eq(reps.discordUserId, clicker.id), eq(reps.active, true)) })
          : null
        const repId = rep?.id ?? 'local_admin'
        await db.update(leads).set({ assignedRepId: repId, ...firstResp }).where(eq(leads.id, lead.id))
        return NextResponse.json({ type: 4, data: { content: `Claimed by ${rep?.displayName ?? clicker?.username ?? 'staff'}.`, flags: EPHEMERAL } })
      }
      if (action === 'paid') {
        await db.update(leads).set({ status: 'payment_received', ...firstResp }).where(eq(leads.id, lead.id))
        await postAdminNotify('💳 Payment received', [`Deal: DEAL-${lead.dealNumber}`, `Customer: ${lead.discordUsername}`], 0x22c55e)
        return NextResponse.json({ type: 4, data: { content: 'Marked payment received.', flags: EPHEMERAL } })
      }
      if (action === 'complete') {
        if (!lead.productId) {
          return NextResponse.json({ type: 4, data: { content: 'Pick a product from the menu first.', flags: EPHEMERAL } })
        }
        const product = await db.query.products.findFirst({ where: eq(products.id, lead.productId) })
        if (!product) {
          return NextResponse.json({ type: 4, data: { content: 'Selected product not found.', flags: EPHEMERAL } })
        }
        await createOrderForLead(lead.id, { packageName: product.name, priceCents: product.priceCents, paymentMethod: null })
        return NextResponse.json({ type: 4, data: { content: `Deal DEAL-${lead.dealNumber} completed — ${product.name} (${formatCents(product.priceCents)}).`, flags: EPHEMERAL } })
      }
      return NextResponse.json({ type: PONG })
    }

    if (!customId.startsWith('tag:')) {
      return NextResponse.json({ type: PONG })
    }
    // custom_id is "tag:<tag>:<ticketChannelId>" (panel lives in a staff channel,
    // so the ticket id is carried explicitly rather than inferred).
    const [, tagPart, ticketId] = customId.split(':')
    const tag = tagPart as TicketTag

    // Staff only — needs Manage Channels.
    const perms = BigInt(interaction.member?.permissions ?? '0')
    if ((perms & MANAGE_CHANNELS) !== MANAGE_CHANNELS) {
      return NextResponse.json({
        type: 4,
        data: { content: 'Staff only.', flags: EPHEMERAL },
      })
    }

    const channelId: string = ticketId || interaction.channel_id || interaction.channel?.id
    const who = interaction.member?.user?.username ?? 'staff'
    const result = await applyTicketTag(channelId, tag)

    return NextResponse.json({
      type: UPDATE_MESSAGE,
      data: {
        embeds: [
          {
            title: 'The Desk — classify this ticket',
            description: `Tagged **${TAG_LABEL[tag]}** by ${who}${result.ok ? '' : ' — no lead found for this ticket'}`,
            color: tag === 'purchase' ? 0x22c55e : 0xf59e0b,
          },
        ],
        components: [], // remove buttons once tagged
      },
    })
  }

  return NextResponse.json({ type: PONG })
}
