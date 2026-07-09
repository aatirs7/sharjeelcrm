const T = process.env.BOT_TOKEN || process.env.DISCORD_BOT_TOKEN
const G = '1457844826203623630'
const api = async (p) => { const r = await fetch(`https://discord.com/api/v10${p}`, { headers: { Authorization: `Bot ${T}` }}); if(!r.ok) return {__err:r.status,__p:p}; return r.json() }
const chans = await api(`/guilds/${G}/channels`)
const targets = chans.filter(c => c.type===0 && /(purchase|ticket|open|support|order|start|buy)/i.test(c.name))
console.log('candidate panel channels:', targets.map(c=>c.name).join(', ') || '(none by name)')
for (const ch of targets) {
  for (const path of [`/channels/${ch.id}/pins`, `/channels/${ch.id}/messages?limit=50`]) {
    const msgs = await api(path)
    if (msgs.__err) { continue }
    for (const m of msgs) {
      const comps = (m.components ?? []).flatMap(c => c.components ?? [])
      if (comps.length) {
        console.log(`\n#${ch.name} [${path.includes('pins')?'pinned':'recent'}] by @${m.author?.username}`)
        for (const b of comps) console.log(`   type${b.type} label="${b.label ?? ''}" placeholder="${b.placeholder ?? ''}" opts=${(b.options||[]).map(o=>o.label).join('/')||''} cid=${(b.custom_id||b.url||'').slice(0,60)}`)
      }
    }
  }
}
console.log('\ndone')
