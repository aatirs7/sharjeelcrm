import { NextResponse, type NextRequest } from 'next/server'
import { PIN_COOKIE, isValidSession } from '@/lib/pin'

/**
 * PIN gate. Everything except /login and the API routes requires a valid
 * session cookie. API routes are skipped on purpose: they authenticate
 * themselves (CRON_SECRET, Discord signature, webhook secret) and are called
 * by machines that can't type a PIN.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  if (pathname === '/login' || pathname.startsWith('/api/')) {
    return NextResponse.next()
  }
  if (isValidSession(request.cookies.get(PIN_COOKIE)?.value)) {
    return NextResponse.next()
  }

  const url = request.nextUrl.clone()
  url.pathname = '/login'
  url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + search)}`
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
