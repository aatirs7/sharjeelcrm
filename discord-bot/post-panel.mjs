// Post the sales panel to a channel. Usage: node discord-bot/post-panel.mjs <channelId>
import { readFileSync } from 'node:fs'
const env = readFileSync('.env.local', 'utf8')
const get = (k) => env.split(/\r?\n/).find((l) => l.startsWith(k + '='))?.slice(k.length + 1).trim()
const TOKEN = get('BOT_TOKEN')
const channelId = process.argv[2]
if (!channelId) {
  console.log('Usage: node discord-bot/post-panel.mjs <channelId>')
  process.exit(1)
}
const payload = {
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
}
const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
  method: 'POST',
  headers: { Authorization: `Bot ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
})
console.log(res.status, res.ok ? 'panel posted' : await res.text())
