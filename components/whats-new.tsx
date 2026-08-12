'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Users,
  Tag,
  Clock,
  Wallet,
  KeyRound,
  Trophy,
  Sparkles,
  ArrowRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'

// Bump this key when there is a new tour so it auto-shows again.
const SEEN_KEY = 'crm_whatsnew_v2'

type Step = {
  icon: React.ComponentType<{ className?: string }>
  title: string
  body: string
  href?: string
  cta?: string
}

const STEPS: Step[] = [
  {
    icon: Sparkles,
    title: 'Your CRM is now a coach platform',
    body: 'Sales can be credited to a coach, commissions run on a 7-day hold-and-approve cycle, and payouts batch automatically. Here is a quick tour of everything new.',
  },
  {
    icon: Users,
    title: 'Coaches',
    body: 'Every coach gets a promo code, tracking link, tier (bronze / silver / gold), and status. Add and manage them all in one place.',
    href: '/coaches',
    cta: 'Open Coaches',
  },
  {
    icon: Tag,
    title: 'Automatic attribution',
    body: 'When a buyer cites a coach’s promo code in a ticket, that ticket and its order are credited to the coach. Anything unattributed can be assigned by hand on the order page.',
  },
  {
    icon: Clock,
    title: 'Commissions with a 7-day hold',
    body: 'Each credited sale creates a commission that holds for 7 days, then approves automatically — unless the charge is refunded or disputed, in which case it cancels. No manual tracking.',
  },
  {
    icon: Wallet,
    title: 'Payouts',
    body: 'Batch a coach’s approved commissions into one paid payout, with method and proof recorded. Held vs payable vs paid to date is always visible per coach.',
    href: '/payouts',
    cta: 'Open Payouts',
  },
  {
    icon: KeyRound,
    title: 'Coach logins',
    body: 'Generate a one-time login code for a coach on the Coaches page. They log in with it and see only their own numbers — tickets, confirmed buyers, commission, and next payout.',
    href: '/coaches',
    cta: 'Open Coaches',
  },
  {
    icon: Trophy,
    title: 'Leaderboard & content',
    body: 'The leaderboard ranks coaches by confirmed buyers each week and assigns tiers monthly. Content tracks each coach’s posts — views, DMs, buyers, and revenue.',
    href: '/leaderboard',
    cta: 'Open Leaderboard',
  },
]

export function WhatsNew({ role = 'admin' }: { role?: 'admin' | 'coach' }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [i, setI] = useState(0)

  // Auto-open once per browser, only for admins outside the login screen.
  useEffect(() => {
    if (role !== 'admin' || pathname === '/login') return
    try {
      if (!localStorage.getItem(SEEN_KEY)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setOpen(true)
      }
    } catch {
      /* localStorage unavailable */
    }
  }, [role, pathname])

  // Let the nav button reopen the tour from the start.
  useEffect(() => {
    function reopen() {
      setI(0)
      setOpen(true)
    }
    window.addEventListener('open-whatsnew', reopen)
    return () => window.removeEventListener('open-whatsnew', reopen)
  }, [])

  function close() {
    setOpen(false)
    try {
      localStorage.setItem(SEEN_KEY, '1')
    } catch {
      /* ignore */
    }
  }

  if (role !== 'admin') return null

  const step = STEPS[i]
  const Icon = step.icon
  const last = i === STEPS.length - 1

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <DialogContent className="w-[92vw] max-w-[720px] sm:max-w-[720px]">
        <div className="flex min-h-[360px] flex-col items-center justify-center gap-6 px-4 py-8 text-center sm:px-10 sm:py-12">
          <span className="grid size-20 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Icon className="size-10" />
          </span>
          <div className="space-y-4">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              what&apos;s new · {i + 1} of {STEPS.length}
            </p>
            <h2 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
              {step.title}
            </h2>
            <p className="mx-auto max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              {step.body}
            </p>
          </div>

          {step.href && (
            <Link
              href={step.href}
              onClick={close}
              className="inline-flex items-center gap-2 text-base font-medium text-primary hover:underline"
            >
              {step.cta ?? 'Open'}
              <ArrowRight className="size-4" />
            </Link>
          )}

          {/* progress dots */}
          <div className="flex items-center gap-2 pt-1">
            {STEPS.map((_, d) => (
              <button
                key={d}
                aria-label={`Step ${d + 1}`}
                onClick={() => setI(d)}
                className={cn(
                  'size-2 rounded-full transition-colors',
                  d === i ? 'bg-primary' : 'bg-muted-foreground/30 hover:bg-muted-foreground/60'
                )}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border/60 px-4 pt-4 sm:px-10">
          <Button variant="ghost" onClick={close}>
            Skip
          </Button>
          <div className="flex items-center gap-2">
            {i > 0 && (
              <Button variant="outline" onClick={() => setI((v) => v - 1)}>
                Back
              </Button>
            )}
            {last ? (
              <Button onClick={close}>Done</Button>
            ) : (
              <Button onClick={() => setI((v) => v + 1)}>Next</Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
