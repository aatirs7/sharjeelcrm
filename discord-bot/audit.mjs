// Read-only Discord server audit. Makes ONLY GET requests — never modifies
// anything. Prints the channel tree, roles, and a sample ticket channel's
// permission overwrites so we can see how tickets are structured and how to
// extract the buyer who opened each ticket.
//
// Usage (from the repo root, token in .env.local as DISCORD_BOT_TOKEN):
//   node --env-file=.env.local discord-bot/audit.mjs
//
// Optional: set DISCORD_GUILD_ID to target a specific server. If omitted, the
// script lists the servers the bot is in and exits so you can pick one.

const API = 'https://discord.com/api/v10'
const TOKEN = process.env.DISCORD_BOT_TOKEN || process.env.BOT_TOKEN
const GUILD_ID = process.env.DISCORD_GUILD_ID || process.env.GUILD_ID

if (!TOKEN) {
  console.error('Missing DISCORD_BOT_TOKEN. Add it to .env.local (do not paste it in chat).')
  process.exit(1)
}

async function api(path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bot ${TOKEN}`, 'User-Agent': 'the-desk-audit/1.0' },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`GET ${path} -> ${res.status} ${res.statusText}\n${body}`)
  }
  return res.json()
}

const CHANNEL_TYPE = {
  0: 'text',
  2: 'voice',
  4: 'category',
  5: 'announcement',
  10: 'news-thread',
  11: 'public-thread',
  12: 'private-thread',
  13: 'stage',
  14: 'directory',
  15: 'forum',
  16: 'media',
}

function overwriteSummary(channel, membersById) {
  const memberOverwrites = (channel.permission_overwrites ?? []).filter((o) => o.type === 1)
  if (!memberOverwrites.length) return '(no member overwrites)'
  return memberOverwrites
    .map((o) => `member:${o.id}${membersById.get(o.id) ? ` (${membersById.get(o.id)})` : ''}`)
    .join(', ')
}

async function main() {
  // Who am I + what servers am I in?
  const me = await api('/users/@me')
  console.log(`Bot: ${me.username} (id ${me.id})\n`)

  const guilds = await api('/users/@me/guilds')
  if (!GUILD_ID) {
    console.log('Bot is in these servers — set DISCORD_GUILD_ID to one of these and re-run:\n')
    for (const g of guilds) console.log(`  ${g.id}  ${g.name}`)
    return
  }

  const guild = guilds.find((g) => g.id === GUILD_ID) ?? { name: '(unknown — not in bot guild list)' }
  console.log(`=== Server: ${guild.name} (${GUILD_ID}) ===\n`)

  // Roles
  const roles = await api(`/guilds/${GUILD_ID}/roles`)
  console.log(`--- Roles (${roles.length}) ---`)
  for (const r of roles.sort((a, b) => b.position - a.position)) {
    const admin = (BigInt(r.permissions) & 8n) === 8n ? '  [ADMIN]' : ''
    console.log(`  ${r.name}${admin}`)
  }
  console.log('')

  // Channels
  const channels = await api(`/guilds/${GUILD_ID}/channels`)
  const categories = channels.filter((c) => c.type === 4).sort((a, b) => a.position - b.position)
  const byParent = new Map()
  for (const c of channels) {
    if (c.type === 4) continue
    const key = c.parent_id ?? '(no category)'
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key).push(c)
  }

  console.log(`--- Channel tree (${channels.length} channels) ---`)
  const printChildren = (parentId) => {
    const kids = (byParent.get(parentId) ?? []).sort((a, b) => a.position - b.position)
    for (const c of kids) {
      console.log(`    - ${c.name}  [${CHANNEL_TYPE[c.type] ?? c.type}]`)
    }
  }
  for (const cat of categories) {
    console.log(`  ▸ ${cat.name}  [category]`)
    printChildren(cat.id)
  }
  if (byParent.has('(no category)')) {
    console.log('  ▸ (no category)')
    printChildren('(no category)')
  }
  console.log('')

  // Guess the ticket setup: a category or channels whose name hints at tickets.
  const looksLikeTicket = (name) => /ticket|support|order|claim/i.test(name)
  const ticketCats = categories.filter((c) => looksLikeTicket(c.name))
  const ticketChannels = channels.filter(
    (c) => c.type === 0 && (looksLikeTicket(c.name) || (c.parent_id && ticketCats.some((t) => t.id === c.parent_id)))
  )

  console.log('--- Likely ticket setup ---')
  if (ticketCats.length) console.log(`  categories: ${ticketCats.map((c) => c.name).join(', ')}`)
  console.log(`  ticket-like channels found: ${ticketChannels.length}`)

  // Sample a few ticket channels and show member overwrites (the opener).
  const sample = ticketChannels.slice(0, 3)
  for (const ch of sample) {
    console.log(`\n  # ${ch.name}`)
    console.log(`    topic: ${ch.topic ?? '(none)'}`)
    console.log(`    member overwrites: ${overwriteSummary(ch, new Map())}`)
  }
  if (!ticketChannels.length) {
    console.log('\n  No ticket-like channels visible. Either none are open right now, or the')
    console.log('  bot cannot see them (private channels need the bot to have a staff role or')
    console.log('  Administrator). Open a test ticket, or re-invite the bot with more access.')
  }

  console.log('\nDone (read-only — nothing was modified).')
}

main().catch((e) => {
  console.error('\nAudit failed:\n', e.message)
  process.exit(1)
})
