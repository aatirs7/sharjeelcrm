import { PinForm } from '@/components/pin-form'
import { Card, CardContent } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

const ERRORS: Record<string, string> = {
  not_linked: 'That Discord account is not linked to a CRM account. Ask an admin to link it.',
  oauth_unconfigured: 'Discord login is not configured yet.',
  oauth_state: 'Login expired, please try again.',
  oauth_token: 'Discord sign-in failed, please try again.',
  oauth_me: 'Could not read your Discord profile.',
  oauth_error: 'Something went wrong signing in with Discord.',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>
}) {
  const { next, error } = await searchParams
  const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/'
  const errMsg = error ? ERRORS[error] ?? 'Sign-in failed.' : null

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-6 pt-10 md:pt-20">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <span className="size-3 rounded-[3px] bg-primary-foreground" />
        </span>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">The Desk</h1>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          enter pin or coach code
        </p>
      </div>

      <Card className="w-full">
        <CardContent className="py-6 space-y-4">
          {errMsg && (
            <p className="rounded-md bg-rose-100 px-3 py-2 text-center text-sm text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
              {errMsg}
            </p>
          )}
          <PinForm next={target} />
          <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>
          <a
            href="/api/auth/discord"
            className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#5865F2] font-medium text-white transition-opacity hover:opacity-90"
          >
            Login with Discord
          </a>
        </CardContent>
      </Card>
    </div>
  )
}
