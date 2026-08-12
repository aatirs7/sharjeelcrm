import { NextResponse, type NextRequest } from 'next/server'
import { PIN_COOKIE } from '@/lib/pin'
import { parseSession } from '@/lib/session'

/**
 * Auth gate.
 *  - /login and /api/* are exempt (API routes self-authenticate).
 *  - No valid session -> /login.
 *  - Coaches can only see /coach/*; anything else redirects them to /coach.
 *  - Admins see everything.
 * Server actions/pages additionally assert role (defense in depth) — the proxy
 * is the first gate, not the only one.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  if (pathname === '/login' || pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  const session = parseSession(request.cookies.get(PIN_COOKIE)?.value)
  if (!session) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + search)}`
    return NextResponse.redirect(url)
  }

  if (session.role === 'coach' && !pathname.startsWith('/coach')) {
    const url = request.nextUrl.clone()
    url.pathname = '/coach'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
