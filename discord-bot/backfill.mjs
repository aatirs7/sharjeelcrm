// Backfill: classify currently-open Ticket Tool tickets and (optionally) create
// CRM leads for the ones that look like purchase inquiries.
//
// DRY RUN by default — prints what it would do, writes nothing. Add --write to
// actually POST leads to the CRM.
//
//   node --env-file=.env.local discord-bot/backfill.mjs            # dry run
//   node --env-file=.env.local discord-bot/backfill.mjs --write    # real import
//
// Env: BOT_TOKEN (or DISCORD_BOT_TOKEN), GUILD_ID (or DISCORD_GUILD_ID),
//      CRM_URL (default the live site), DISCORD_WEBHOOK_SECRET (for --write).

const TOKEN = process.env.BOT_TOKEN || process.env.DISCORD_BOT_TOKEN
const GUILD_ID = process.env.GUILD_ID || process.env.DISCORD_GUILD_ID || '1457844826203623630'
const CRM_URL = process.env.CRM_URL || 'https://sharjeelcrm.vercel.app'
const CRM_SECRET = process.env.DISCORD_WEBHOOK_SECRET
const WRITE = process.argv.includes('--write')
const LIMIT = Number(process.env.LIMIT || 40)

if (!TOKEN) { console.error('Missing BOT_TOKEN'); process.exit(1) }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function dapi(path) {
  for (let i = 0; i < 5; i++) {
    const res = await fetch(`https://discord.com/api/v10${path}`, {
      headers: { Authorization: `Bot ${TOKEN}`, 'User-Agent': 'the-desk/1.0' },
    })
    if (res.status === 429) { const b = await res.json().catch(() => ({})); await sleep((b.retry_after ?? 1) * 1000 + 200); continue }
    if (!res.ok) return { __err: res.status }
    return res.json()
  }
  return { __err: 'ratelimited' }
}

// --- classification ------------------------------------------------------
const PURCHASE =
  /\b(buy|buying|purchase|looking for|interested|how much|price|cost|pricing|account|acc|accs|\d+\s*k\b|\d{2,3}k|followers?|tts|tiktok shop|shop account|dm|inquire|get a|want a|order|delivery|preview|available|audience|usa|uk|provinces?|flag|assurance|grow(th)?)\b/i
// Referrals & payment talk are strong purchase signals on this shop.
const REFERRAL = /\b(sent me|sent from|referred|recommend(ed)?|shared|came from|told me|promo|discount|coupon|code)\b/i
const PAYMENT = /(\$\s?\d|btc|crypto|paypal|zelle|cashapp|payment|pay|usd)/i
const SUPPORT = /\b(warranty|banned|suspended|refund|replace|replacement|not working|can'?t (log|access)|locked out|help with my (account|order)|already (bought|purchased|paid)|payout hold|got flagged|my account (is|got|was))\b/i

function classify(text) {
  if (!text) return 'unknown'
  const support = SUPPORT.test(text)
  const purchase = PURCHASE.test(text) || REFERRAL.test(text) || PAYMENT.test(text)
  if (support && !purchase) return 'support'
  if (purchase) return 'purchase'
  return 'unknown'
}

// Rough affiliate/referral code hints (e.g. "AA10", "code AC").
function detectCode(text) {
  if (!text) return null
  const m = text.match(/\b(?:code|discount|coupon|ref(?:erral)?)\s*[:#-]?\s*([A-Za-z0-9]{2,10})\b/i)
  if (m) return m[1]
  const m2 = text.match(/\b([A-Z]{2}\d{1,3})\b/) // AA10-style
  return m2 ? m2[1] : null
}

function firstMention(content) {
  const m = (content || '').match(/<@!?(\d+)>/)
  return m ? m[1] : null
}

async function main() {
  const chans = await dapi(`/guilds/${GUILD_ID}/channels`)
  const tickets = chans
    .filter((c) => c.type === 0 && /^ticket-\d+/.test(c.name))
    .sort((a, b) => b.name.localeCompare(a.name))
    .slice(0, LIMIT)

  console.log(`Scanning ${tickets.length} open tickets (LIMIT=${LIMIT})  |  mode: ${WRITE ? 'WRITE' : 'DRY RUN'}\n`)
  const counts = { purchase: 0, support: 0, unknown: 0, created: 0, skipped: 0, noBuyer: 0 }
  const rows = []

  for (const ch of tickets) {
    const msgs = await dapi(`/channels/${ch.id}/messages?after=1&limit=8`)
    await sleep(250)
    if (msgs.__err || !Array.isArray(msgs)) { counts.noBuyer++; continue }
    const ordered = msgs.slice().sort((a, b) => a.id.localeCompare(b.id)) // oldest first

    // opener = user pinged in the Ticket Tool welcome
    const welcome = ordered.find((m) => m.author?.bot && /welcome/i.test(m.content || ''))
    let openerId = welcome ? firstMention(welcome.content) : null
    if (!openerId) {
      const nonBot = ordered.find((m) => !m.author?.bot)
      openerId = nonBot?.author?.id ?? null
    }
    if (!openerId) { counts.noBuyer++; continue }

    const buyerMsgs = ordered.filter((m) => m.author?.id === openerId && m.content)
    const buyer = buyerMsgs[0]?.author ?? null
    const firstText = buyerMsgs.map((m) => m.content).join(' ').slice(0, 400)
    const username = buyer?.username ?? '(unknown)'
    const cls = classify(firstText)
    const code = detectCode(firstText)
    counts[cls]++

    rows.push({ ticket: ch.name, username, cls, code, text: (firstText || '(no buyer message)').slice(0, 90) })

    if (WRITE && cls === 'purchase') {
      if (!CRM_SECRET) { console.error('Missing DISCORD_WEBHOOK_SECRET for --write'); process.exit(1) }
      const res = await fetch(`${CRM_URL}/api/discord/lead`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${CRM_SECRET}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discordUsername: username,
          discordChannelId: ch.id,
          ticketLink: `https://discord.com/channels/${GUILD_ID}/${ch.id}`,
          source: code ? 'affiliate' : 'discord',
          referralCode: code || null,
          interest: firstText || null,
        }),
      })
      if (res.ok) counts.created++
      else { counts.skipped++; console.error(`  write failed ${ch.name}: ${res.status}`) }
      await sleep(150)
    }
  }

  for (const r of rows) {
    const tag = { purchase: '🛒', support: '🛟', unknown: '❔' }[r.cls]
    console.log(`${tag} ${r.ticket.padEnd(12)} @${r.username.padEnd(20)} ${r.code ? `[code ${r.code}] ` : ''}${r.text}`)
  }
  console.log(`\nclassified — purchase:${counts.purchase} support:${counts.support} unknown:${counts.unknown} noBuyer:${counts.noBuyer}`)
  if (WRITE) console.log(`leads created:${counts.created} failed:${counts.skipped}`)
  else console.log('(dry run — nothing written; add --write to import purchases)')
}
main().catch((e) => { console.error(e); process.exit(1) })
