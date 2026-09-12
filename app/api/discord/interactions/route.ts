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
import { getSetting } from '@/lib/settings'
import { createCheckoutSession, stripeStatus } from '@/lib/stripe'
import { applyDiscount, priceLine, resolveLeadPromo } from '@/lib/promo'

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

/**
 * After the buyer picks a product, ask how they want to pay. Card opens a
 * Stripe Checkout link; crypto posts the saved wallets (or asks them to wait
 * for the owner when none are saved).
 */
async function postPaymentPicker(channelId: string, productName: string, price: string): Promise<void> {
  await postToChannel(channelId, {
    embeds: [
      {
        title: '💳 How would you like to pay?',
        description: `**${productName}** — ${price}\n\nCard is instant via Stripe. Crypto is sent to one of our wallets and confirmed by staff.`,
        color: 0x2f66e6,
      },
    ],
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 3, label: 'Card (Stripe)', emoji: { name: '💳' }, custom_id: `pay:card:${channelId}` },
          { type: 2, style: 1, label: 'Crypto', emoji: { name: '🪙' }, custom_id: `pay:crypto:${channelId}` },
        ],
      },
    ],
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
        content: `<@${user.id}> ${cfg.welcome}\n\nIf you have a **referral or promo code**, drop it here to get your discount — a team member will be with you shortly.`,
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
        const lead = await db.query.leads.findFirst({ where: eq(leads.discordChannelId, channelId) })
        const patch: Partial<typeof leads.$inferInsert> = { productId: product.id }
        // Changing product invalidates any checkout link made for the old price.
        if (lead?.productId && lead.productId !== product.id) {
          patch.paymentLink = null
          patch.stripeSessionId = null
        }
        if (lead && (lead.status === 'new_lead' || lead.status === 'contacted')) patch.status = 'product_selected'
        await db.update(leads).set(patch).where(eq(leads.discordChannelId, channelId))
        // Promo code (typed in the ticket or caught at ingest) takes money off the price.
        const promo = lead ? await resolveLeadPromo(lead) : { coach: null, code: null, discountCents: 0 }
        const price = priceLine(product.priceCents, promo)
        await postPaymentPicker(channelId, product.name, price)
        return NextResponse.json({
          type: 4,
          data: { content: `Selected **${product.name}** (${price}). Pick a payment method below.`, flags: EPHEMERAL },
        })
      }
      return NextResponse.json({ type: 4, data: { content: 'Not found.', flags: EPHEMERAL } })
    }

    // Buyer picks how to pay: card (Stripe Checkout) or crypto (wallet transfer).
    if (customId.startsWith('pay:')) {
      const [, method, channelId] = customId.split(':')
      const lead = await db.query.leads.findFirst({ where: eq(leads.discordChannelId, channelId) })
      if (!lead) {
        return NextResponse.json({ type: 4, data: { content: 'No deal is linked to this ticket.', flags: EPHEMERAL } })
      }
      const clicker = interaction.member?.user ?? interaction.user
      if (lead.discordUserId && clicker?.id !== lead.discordUserId && !isStaff(interaction)) {
        return NextResponse.json({ type: 4, data: { content: 'Only the ticket owner can choose a payment method.', flags: EPHEMERAL } })
      }
      if (['payment_received', 'fulfillment', 'completed'].includes(lead.status)) {
        return NextResponse.json({ type: 4, data: { content: 'This ticket is already paid.', flags: EPHEMERAL } })
      }
      const product = lead.productId
        ? await db.query.products.findFirst({ where: eq(products.id, lead.productId) })
        : null
      if (!product) {
        return NextResponse.json({ type: 4, data: { content: 'Pick a product from the menu first.', flags: EPHEMERAL } })
      }
      const guildId = interaction.guild_id
      const ticketUrl = lead.ticketLink ?? (guildId ? `https://discord.com/channels/${guildId}/${channelId}` : 'https://discord.com/channels/@me')
      // Promo discount comes off the list price everywhere below (Stripe amount, wallet amount, messages).
      const promo = await resolveLeadPromo(lead)
      const amountCents = applyDiscount(product.priceCents, promo.discountCents)
      const price = priceLine(product.priceCents, promo)
      const dealLine = `Deal: DEAL-${lead.dealNumber}`
      const customerLine = `Customer: ${lead.discordUsername}`
      const productLine = `Product: ${product.name} (${formatCents(amountCents)}${promo.code ? `, promo ${promo.code} −${formatCents(product.priceCents - amountCents)}` : ''})`

      if (method === 'card') {
        const stripe = stripeStatus()
        // Stripe needs at least $0.50; anything smaller falls back to a manual link.
        if (stripe.canCharge && amountCents >= 50) {
          try {
            const session = await createCheckoutSession({
              leadId: lead.id,
              dealNumber: lead.dealNumber,
              productName: product.name,
              amountCents,
              returnUrl: ticketUrl,
              customerLabel: lead.discordUsername,
            })
            await db
              .update(leads)
              .set({ paymentMethod: 'card', paymentLink: session.url, stripeSessionId: session.id, status: 'waiting_payment' })
              .where(eq(leads.id, lead.id))
            await postToChannel(channelId, {
              embeds: [
                {
                  title: '💳 Pay by card',
                  description: `**${product.name}** — ${price}\n\nClick the button to pay securely with Stripe. ${process.env.STRIPE_WEBHOOK_SECRET ? 'This ticket updates automatically once the payment goes through.' : 'Let us know here once you have paid.'}`,
                  color: 0x22c55e,
                },
              ],
              components: [
                { type: 1, components: [{ type: 2, style: 5, label: 'Pay with Stripe', emoji: { name: '🔒' }, url: session.url }] },
              ],
            })
            await postAdminNotify('💳 Card checkout sent', [dealLine, customerLine, productLine, 'Stripe Checkout link posted in the ticket.'], 0x3b82f6)
            return NextResponse.json({ type: 4, data: { content: 'Your secure card payment link is posted above.', flags: EPHEMERAL } })
          } catch (e) {
            await postAdminNotify(
              '⚠️ Stripe checkout failed',
              [dealLine, customerLine, productLine, `Error: ${e instanceof Error ? e.message : 'unknown'}`, 'Send the buyer a payment link by hand.'],
              0xf59e0b
            )
          }
        }
        // No usable Stripe key (or Stripe errored): staff send the link by hand.
        await db
          .update(leads)
          .set({ paymentMethod: 'card', status: 'waiting_payment' })
          .where(eq(leads.id, lead.id))
        await postToChannel(channelId, {
          embeds: [
            {
              title: '💳 Card payment',
              description: `**${product.name}** — ${price}\n\nA team member will send your secure card payment link here shortly.`,
              color: 0x3b82f6,
            },
          ],
        })
        if (stripe.configured && !stripe.canCharge) {
          await postAdminNotify(
            '💳 Buyer chose card — send a link',
            [dealLine, customerLine, productLine, 'STRIPE_SECRET_KEY is a restricted key; a full sk_ key is needed to create checkout links automatically.'],
            0xf59e0b
          )
        } else if (!stripe.configured) {
          await postAdminNotify(
            '💳 Buyer chose card — send a link',
            [dealLine, customerLine, productLine, 'Stripe is not connected, so the link must be sent by hand.'],
            0xf59e0b
          )
        }
        return NextResponse.json({ type: 4, data: { content: 'Noted — a team member will send your card payment link shortly.', flags: EPHEMERAL } })
      }

      if (method === 'crypto') {
        const wallets = await getSetting('cryptoAddresses')
        await db
          .update(leads)
          .set({ paymentMethod: 'crypto', paymentLink: null, stripeSessionId: null, status: 'waiting_payment' })
          .where(eq(leads.id, lead.id))
        if (wallets.length > 0) {
          const list = wallets
            .map((w) => `**${w.coin}**${w.network ? ` · ${w.network}` : ''}\n\`${w.address}\``)
            .join('\n\n')
          await postToChannel(channelId, {
            embeds: [
              {
                title: '🪙 Pay with crypto',
                description:
                  `**${product.name}** — ${price}\n\n` +
                  `Send the equivalent of **${formatCents(amountCents)}** to one of these wallets:\n\n${list}\n\n` +
                  'Double-check the network before sending. Then reply here with the transaction hash (or a screenshot) and a team member will confirm your payment.',
                color: 0xf59e0b,
              },
            ],
          })
          await postAdminNotify('🪙 Crypto payment requested', [dealLine, customerLine, productLine, `Wallets posted: ${wallets.map((w) => w.coin).join(', ')}. Confirm the transfer, then press Mark Paid.`], 0xf59e0b)
          return NextResponse.json({ type: 4, data: { content: 'Wallet addresses are posted above. Reply with your transaction hash once sent.', flags: EPHEMERAL } })
        }
        await postToChannel(channelId, {
          embeds: [
            {
              title: '🪙 Pay with crypto',
              description: `**${product.name}** — ${price}\n\nPlease hold on — a team member will reply here with a wallet address shortly.`,
              color: 0xf59e0b,
            },
          ],
        })
        await postAdminNotify(
          '🪙 Crypto payment requested — reply needed',
          [dealLine, customerLine, productLine, `The buyer is waiting for a wallet address in <#${channelId}>.`, 'Tip: save wallets under Settings → Payments and the bot will post them automatically next time.'],
          0xf59e0b
        )
        return NextResponse.json({ type: 4, data: { content: 'Noted — a team member will reply with a wallet address shortly.', flags: EPHEMERAL } })
      }
      return NextResponse.json({ type: PONG })
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
        const promo = await resolveLeadPromo(lead)
        const amountCents = applyDiscount(product.priceCents, promo.discountCents)
        await createOrderForLead(lead.id, {
          packageName: product.name,
          priceCents: amountCents,
          discountCents: product.priceCents - amountCents,
          paymentMethod: lead.paymentMethod ?? null,
        })
        return NextResponse.json({ type: 4, data: { content: `Deal DEAL-${lead.dealNumber} completed — ${product.name} (${priceLine(product.priceCents, promo)}).`, flags: EPHEMERAL } })
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
