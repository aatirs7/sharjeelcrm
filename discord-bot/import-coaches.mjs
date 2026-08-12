// Import Discord lead-* roles as coach records + plan partner roles.
// Dry-run by default; pass --write to actually mutate Discord + the DB.
import { neon } from '@neondatabase/serverless'
import { readFileSync } from 'node:fs'
const env = readFileSync('.env.local','utf8')
const get = (k) => env.split(/\r?\n/).find(l=>l.startsWith(k+'='))?.slice(k.length+1).trim()
const TOKEN = get('BOT_TOKEN'); const sql = neon(get('DATABASE_URL'))
const WRITE = process.argv.includes('--write')
const H = { Authorization: `Bot ${TOKEN}`, 'Content-Type':'application/json' }
const api = async (p, opt) => { const r = await fetch('https://discord.com/api/v10'+p,{headers:H,...opt}); if(!r.ok) throw new Error(`${p} ${r.status} ${await r.text()}`); return r.json() }
const norm = (s) => (s||'').toLowerCase().replace(/[^a-z0-9]/g,'')

const [guild] = await api('/users/@me/guilds')
const GUILD = guild.id
const roles = await api(`/guilds/${GUILD}/roles`)
const leadRoles = roles.filter(r => /^lead-/i.test(r.name))
const existingByName = new Map(roles.map(r=>[r.name.toLowerCase(), r.id]))

const coaches = await sql.query('select id, name, coach_code, promo_code, lead_role, partner_role from coaches')
const findCoach = (handle) => coaches.find(c =>
  norm(c.coach_code)===norm(handle) || norm(c.promo_code)===norm(handle) || norm(c.name)===norm(handle))

let matched=0, created=0, partnersToCreate=0
console.log(`\n${WRITE?'WRITE':'DRY-RUN'} — ${leadRoles.length} lead-* roles\n`)
for (const role of leadRoles) {
  const handle = role.name.replace(/^lead-/i,'')
  const partnerName = `partner-${handle}`
  let coach = findCoach(handle)
  let action
  if (coach) { action = `match -> ${coach.name}`; matched++ }
  else { action = `NEW coach "${handle}"`; created++ }
  const partnerExists = existingByName.has(partnerName.toLowerCase())
  if (!partnerExists) partnersToCreate++

  if (WRITE) {
    // partner role
    let partnerId = existingByName.get(partnerName.toLowerCase())
    if (!partnerId) {
      const pr = await api(`/guilds/${GUILD}/roles`, {method:'POST', body: JSON.stringify({name:partnerName, mentionable:false})})
      partnerId = pr.id
    }
    if (coach) {
      await sql.query('update coaches set lead_role=$1, partner_role=$2 where id=$3', [role.id, partnerId, coach.id])
    } else {
      await sql.query('insert into coaches (name, coach_code, lead_role, partner_role) values ($1,$2,$3,$4)', [handle, handle, role.id, partnerId])
    }
  }
  console.log(`  lead-${handle}`.padEnd(30), action, partnerExists?'(partner exists)':`(create ${partnerName})`)
}
console.log(`\n${matched} matched, ${created} new coaches, ${partnersToCreate} partner roles ${WRITE?'created':'to create'}.`)
if (!WRITE) console.log('\nRe-run with --write to apply.')
