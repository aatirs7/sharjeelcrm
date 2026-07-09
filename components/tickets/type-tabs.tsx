'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'

const TABS = [
  { v: 'all', l: 'All' },
  { v: 'purchase', l: 'Purchase' },
  { v: 'support', l: 'Support' },
  { v: 'question', l: 'Question' },
] as const

export function TicketTypeTabs({ type }: { type: string }) {
  const router = useRouter()
  const params = useSearchParams()

  function set(v: string) {
    const next = new URLSearchParams(params.toString())
    if (v === 'all') next.delete('type')
    else next.set('type', v)
    router.push(`/tickets?${next.toString()}`)
  }

  return (
    <div className="inline-flex rounded-lg border bg-card p-0.5 font-mono">
      {TABS.map((t) => (
        <button
          key={t.v}
          type="button"
          onClick={() => set(t.v)}
          className={cn(
            'rounded-md px-3.5 py-1.5 text-[11px] uppercase tracking-[0.12em] transition-colors',
            type === t.v
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {t.l}
        </button>
      ))}
    </div>
  )
}
