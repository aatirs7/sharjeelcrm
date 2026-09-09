import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { randomBytes } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { reps, coaches } from '@/lib/db/schema'
import { PIN_COOKIE, PIN_MAX_AGE } from '@/lib/pin'
import { mintSession } from '@/lib/session'
import { COACH_JOIN_COOKIE } from '@/lib/coach-join-cookie'
import { landingFor, type Role } from '@/lib/permissions'

/** Slug for a coach handle: lowercase, dashed, unique via a short suffix. */
async function uniqueCoachCode(name: string): Promise<string> {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'coach'
  const existing = await db
    .select({ id: coaches.id })
    .from(coaches)
    .where(eq(coaches.coachCode, base))
    .limit(1)
  return existing.length === 0 ? base : `${base}-${randomBytes(2).toString('hex')}`
}

export const dynamic = 'force-dynamic'

const clientId = () => process.env.DISCORD_CLIENT_ID || process.env.APPLICATION_ID || '1524866733079400488'
const baseUrl = (req: Request) => process.env.OAUTH_BASE_URL || new URL(req.url).origin

/**
 * Discord OAuth callback (spec §42): exchange the code, identify the user, and
 * map their Discord account to an app session:
 *  - a rep linked by discord_user_id -> that rep's role
 *  - a coach linked by discord_user_id -> coach session
 *  - the Discord server owner -> owner
 * Anyone else is not linked and is bounced to /login.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const jar = await cookies()
  const expected = jar.get('oauth_state')?.value

  const bounce = (err: string) => NextResponse.redirect(`${baseUrl(req)}/login?error=${err}`)

  if (!code || !state || !expected || state !== expected) return bounce('oauth_state')
  const secret = process.env.DISCORD_CLIENT_SECRET
  if (!secret) return bounce('oauth_unconfigured')

  try {
    // 1) exchange the code for an access token
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId(),
        client_secret: secret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${baseUrl(req)}/api/auth/discord/callback`,
      }),
    })
    if (!tokenRes.ok) return bounce('oauth_token')
    const token = (await tokenRes.json()) as { access_token: string }

    // 2) identify the user
    const meRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    })
    if (!meRes.ok) return bounce('oauth_me')
    const me = (await meRes.json()) as { id: string; username: string }

    // 3) map to an app session
    const rep = await db.query.reps.findFirst({
      where: and(eq(reps.discordUserId, me.id), eq(reps.active, true)),
    })
    let token2: string | null = null
    let dest = '/'
    if (rep) {
      const role = (rep.role as Role) ?? 'worker'
      token2 = mintSession(role, rep.id)
      dest = landingFor(role)
    } else {
      const coach = await db.query.coaches.findFirst({
        where: and(eq(coaches.discordUserId, me.id), eq(coaches.status, 'active')),
      })
      if (coach) {
        token2 = mintSession('coach', coach.id)
        dest = '/coach'
      } else {
        // The Discord server owner becomes the app owner.
        const guildId = process.env.GUILD_ID
        if (guildId && process.env.BOT_TOKEN) {
          const g = await fetch(`https://discord.com/api/guilds/${guildId}`, {
            headers: { Authorization: `Bot ${process.env.BOT_TOKEN}` },
          })
          if (g.ok) {
            const guild = (await g.json()) as { owner_id: string }
            if (guild.owner_id === me.id) {
              token2 = mintSession('owner', 'local_admin')
              dest = '/'
            }
          }
        }
      }
    }

    // Self-serve coach signup: a join cookie is present and this Discord user is
    // not yet a rep/coach/owner, so create their coach now with the code they
    // chose. The unique index on promo_code is the final guard against a race.
    const joinRaw = jar.get(COACH_JOIN_COOKIE)?.value
    if (!token2 && joinRaw) {
      try {
        const join = JSON.parse(joinRaw) as { name?: string; promoCode?: string }
        const name = (join.name ?? '').trim()
        const promoCode = (join.promoCode ?? '').trim().toUpperCase()
        if (name && promoCode) {
          const taken = await db
            .select({ id: coaches.id })
            .from(coaches)
            .where(sql`lower(${coaches.promoCode}) = lower(${promoCode})`)
            .limit(1)
          if (taken.length > 0) {
            const r = NextResponse.redirect(`${baseUrl(req)}/coach/join?error=promo_taken`)
            r.cookies.delete(COACH_JOIN_COOKIE)
            r.cookies.delete('oauth_state')
            return r
          }
          const [created] = await db
            .insert(coaches)
            .values({
              name,
              promoCode,
              coachCode: await uniqueCoachCode(name),
              discordUsername: me.username,
              discordUserId: me.id,
              status: 'active',
            })
            .returning({ id: coaches.id })
          token2 = mintSession('coach', created.id)
          dest = '/coach'
        }
      } catch {
        /* fall through to not_linked if the cookie was malformed */
      }
    }

    if (!token2) return bounce('not_linked')

    const res = NextResponse.redirect(`${baseUrl(req)}${dest}`)
    res.cookies.delete(COACH_JOIN_COOKIE)
    res.cookies.set(PIN_COOKIE, token2, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: PIN_MAX_AGE,
    })
    res.cookies.delete('oauth_state')
    return res
  } catch {
    return bounce('oauth_error')
  }
}
