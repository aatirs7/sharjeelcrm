import { CoachJoinForm } from '@/components/coaches/coach-join-form'
import { Card, CardContent } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

const ERRORS: Record<string, string> = {
  promo_taken: 'That promo code was just taken. Please pick another.',
  oauth_state: 'Sign-up expired, please try again.',
  oauth_token: 'Discord sign-in failed, please try again.',
  oauth_me: 'Could not read your Discord profile.',
  oauth_error: 'Something went wrong. Please try again.',
}

/**
 * Public self-serve coach signup. A partner opens this link, picks a display
 * name and promo code, and signs in with Discord to become an active coach.
 */
export default async function CoachJoinPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const errMsg = error ? ERRORS[error] ?? 'Sign-up failed.' : null

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-6 pt-10 md:pt-20">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <span className="size-3 rounded-[3px] bg-primary-foreground" />
        </span>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Become a partner</h1>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          earn on every sale you refer
        </p>
      </div>

      <Card className="w-full">
        <CardContent className="space-y-4 py-6">
          {errMsg && (
            <p className="rounded-md bg-rose-100 px-3 py-2 text-center text-sm text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
              {errMsg}
            </p>
          )}
          <CoachJoinForm />
          <p className="text-center text-xs text-muted-foreground">
            You will sign in with Discord and land on your own dashboard to track referrals and payouts.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
