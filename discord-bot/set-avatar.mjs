// Set the bot's Discord profile picture from the terminal (no gateway needed).
//
// Run (from repo root):
//   node --env-file=.env.local discord-bot/set-avatar.mjs            # uses public/bot-avatar.png (SA logo)
//   node --env-file=.env.local discord-bot/set-avatar.mjs path/to.png
// Env: BOT_TOKEN (or DISCORD_BOT_TOKEN)

import { readFile } from 'node:fs/promises'
import path from 'node:path'

const TOKEN = process.env.BOT_TOKEN || process.env.DISCORD_BOT_TOKEN
if (!TOKEN) {
  console.error('Missing BOT_TOKEN')
  process.exit(1)
}

const file = process.argv[2] || path.join(process.cwd(), 'public', 'bot-avatar.png')
const ext = path.extname(file).toLowerCase()
const mime = ext === '.gif' ? 'image/gif' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png'
const bytes = await readFile(file)

const res = await fetch('https://discord.com/api/v10/users/@me', {
  method: 'PATCH',
  headers: { Authorization: `Bot ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ avatar: `data:${mime};base64,${bytes.toString('base64')}` }),
})
const json = await res.json().catch(() => ({}))
if (!res.ok) {
  console.error(`Discord -> ${res.status}`, json)
  process.exit(1)
}
console.log(`Updated ${json.username}'s profile picture from ${path.relative(process.cwd(), file)}`)
