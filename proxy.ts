import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

// Next.js 16 renamed `middleware` to `proxy` (Node runtime). Clerk 7 supports it.
// Everything is behind the Clerk wall except the sign-in/up UI and the two
// bearer-authenticated API seams (cron + Phase-2 Discord), which guard themselves.
const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/cron/(.*)',
  '/api/discord/(.*)',
])

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    // Skip Next internals and static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}
