import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'

export const dynamic = 'force-dynamic'

function clientId(): string {
  return process.env.DISCORD_CLIENT_ID || process.env.APPLICATION_ID || '1524866733079400488'
}
function baseUrl(req: Request): string {
  return process.env.OAUTH_BASE_URL || new URL(req.url).origin
}

/** Start "Login with Discord" (spec §42). Redirects to Discord's consent screen. */
export async function GET(req: Request): Promise<Response> {
  const state = randomBytes(16).toString('hex')
  const redirectUri = `${baseUrl(req)}/api/auth/discord/callback`
  const url = new URL('https://discord.com/oauth2/authorize')
  url.searchParams.set('client_id', clientId())
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'identify')
  url.searchParams.set('state', state)

  const res = NextResponse.redirect(url.toString())
  res.cookies.set('oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600,
  })
  return res
}
