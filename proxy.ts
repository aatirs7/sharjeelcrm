import { NextResponse, type NextRequest } from 'next/server'
import { PIN_COOKIE } from '@/lib/pin'
import { parseSession } from '@/lib/session'
import { can, capabilityForPath, landingFor } from '@/lib/permissions'

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

  if (pathname === '/login' || pathname.startsWith('/api/') || pathname.startsWith('/ref/')) {
    return NextResponse.next()
  }

  const session = parseSession(request.cookies.get(PIN_COOKIE)?.value)
  if (!session) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + search)}`
    return NextResponse.redirect(url)
  }

  if (session.role === 'coach') {
    if (!pathname.startsWith('/coach')) {
      const url = request.nextUrl.clone()
      url.pathname = '/coach'
      url.search = ''
      return NextResponse.redirect(url)
    }
    return NextResponse.next()
  }

  // Staff (owner/admin/manager/worker): gate each path by capability.
  if (!can(session.role, capabilityForPath(pathname))) {
    const url = request.nextUrl.clone()
    url.pathname = landingFor(session.role)
    url.search = ''
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
