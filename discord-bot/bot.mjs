// The Desk — Phase-2 Discord bot.
//
// On a new Ticket Tool ticket:
//   1. detect the buyer (the member overwrite that isn't a bot) and create a
//      lead immediately (lead-on-ticket-open),
//   2. post Purchase / Support / Warranty buttons so staff tag the ticket,
//   3. when the buyer sends their first message, enrich the lead (interest +
//      referral code).
// Tagging Support/Warranty marks the lead lost in the CRM.
//
// Run: node --env-file=.env.local discord-bot/bot.mjs   (from repo root)
// Env: BOT_TOKEN, GUILD_ID (optional), CRM_URL, DISCORD_WEBHOOK_SECRET,
//      TICKET_PREFIX (default "ticket-"), TICKET_TOOL_ID (default set below).

import {
  Client,
  GatewayIntentBits,
  Events,
  ChannelType,
  OverwriteType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
} from 'discord.js'

const TOKEN = process.env.BOT_TOKEN || process.env.DISCORD_BOT_TOKEN
const GUILD_ID = process.env.GUILD_ID || process.env.DISCORD_GUILD_ID || null
const CRM_URL = process.env.CRM_URL || 'https://sharjeelcrm.vercel.app'
const CRM_SECRET = process.env.DISCORD_WEBHOOK_SECRET
const TICKET_PREFIX = process.env.TICKET_PREFIX || 'ticket-'
const TICKET_TOOL_ID = process.env.TICKET_TOOL_ID || '557628352828014614'

if (!TOKEN || !CRM_SECRET) {
  console.error('Missing BOT_TOKEN or DISCORD_WEBHOOK_SECRET')
  process.exit(1)
}

// channelId -> buyer user id, so we only enrich from the buyer's own messages.
const openerByChannel = new Map()
const enriched = new Set()

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const isTicket = (ch) =>
  ch?.type === ChannelType.GuildText && ch.name?.startsWith(TICKET_PREFIX)

async function crm(path, body) {
  try {
    const res = await fetch(`${CRM_URL}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${CRM_SECRET}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) console.error(`CRM ${path} -> ${res.status}`, json)
    return { ok: res.ok, json }
  } catch (e) {
    console.error(`CRM ${path} failed:`, e.message)
    return { ok: false }
  }
}

function detectCode(text) {
  if (!text) return null
  const m1 = text.match(/\b([A-Za-z]{2,4}\d{1,3})\b/) // AA10 / RAY10
  if (m1) return m1[1].toUpperCase()
  const m2 = text.match(/\b(?:code|promo|coupon|discount)\s*[:#-]?\s*([A-Za-z0-9]{2,10})\b/i)
  if (m2 && /\d/.test(m2[1])) return m2[1].toUpperCase()
  return null
}

/** The buyer is the member overwrite that isn't a bot / Ticket Tool / us. */
async function findBuyer(channel, clientId) {
  const overwrites = channel.permissionOverwrites.cache.filter(
    (o) => o.type === OverwriteType.Member && o.id !== TICKET_TOOL_ID && o.id !== clientId
  )
  for (const [id] of overwrites) {
    try {
      const member = await channel.guild.members.fetch(id)
      if (!member.user.bot) return member.user
    } catch {
      /* left the server / uncacheable — skip */
    }
  }
  return null
}

function tagRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tag:purchase').setLabel('Purchase').setEmoji('🛒').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('tag:support').setLabel('Support').setEmoji('🛟').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tag:warranty').setLabel('Warranty').setEmoji('🛡️').setStyle(ButtonStyle.Secondary)
  )
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
})

client.once(Events.ClientReady, (c) => {
  console.log(`Bot online as ${c.user.tag} — watching for "${TICKET_PREFIX}*" tickets`)
})

client.on(Events.ChannelCreate, async (channel) => {
  if (!isTicket(channel)) return
  if (GUILD_ID && channel.guild.id !== GUILD_ID) return
  try {
    await sleep(3000) // let Ticket Tool add the opener's permission overwrite
    const fresh = await channel.fetch()
    const buyer = await findBuyer(fresh, client.user.id)
    if (!buyer) {
      console.warn(`${channel.name}: could not resolve buyer yet`)
      return
    }
    openerByChannel.set(channel.id, buyer.id)

    const ticketLink = `https://discord.com/channels/${channel.guild.id}/${channel.id}`
    await crm('/api/discord/lead', {
      discordUsername: buyer.username,
      discordChannelId: channel.id,
      ticketLink,
      source: 'discord',
    })

    const embed = new EmbedBuilder()
      .setTitle('The Desk — classify this ticket')
      .setDescription(
        `Lead created for **${buyer.username}**. Staff: tag this ticket so the CRM knows what it is.`
      )
      .setColor(0x3b82f6)
    await channel.send({ embeds: [embed], components: [tagRow()] })
    console.log(`${channel.name}: lead created for @${buyer.username}`)
  } catch (e) {
    console.error(`channelCreate error on ${channel?.name}:`, e.message)
  }
})

client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot || !isTicket(msg.channel)) return
  const openerId = openerByChannel.get(msg.channel.id)
  if (msg.author.id !== openerId || enriched.has(msg.channel.id)) return
  if (!msg.content?.trim()) return
  enriched.add(msg.channel.id)
  const code = detectCode(msg.content)
  await crm('/api/discord/lead', {
    discordUsername: msg.author.username,
    discordChannelId: msg.channel.id,
    ticketLink: `https://discord.com/channels/${msg.guild.id}/${msg.channel.id}`,
    interest: msg.content.slice(0, 500),
    referralCode: code || undefined,
    source: code ? 'affiliate' : 'discord',
  })
  console.log(`${msg.channel.name}: enriched lead${code ? ` (code ${code})` : ''}`)
})

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton() || !interaction.customId.startsWith('tag:')) return
  // Staff only — buyers can't tag.
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
    return interaction.reply({ content: 'Staff only.', ephemeral: true })
  }
  const tag = interaction.customId.split(':')[1]
  const { ok } = await crm('/api/discord/ticket-tag', {
    discordChannelId: interaction.channelId,
    tag,
  })
  await interaction.update({
    embeds: [
      EmbedBuilder.from(interaction.message.embeds[0]).setDescription(
        `Tagged **${tag}** by ${interaction.user.username}${ok ? '' : ' (CRM update failed — check logs)'}`
      ),
    ],
    components: [], // remove buttons once tagged
  })
})

client.login(TOKEN)
