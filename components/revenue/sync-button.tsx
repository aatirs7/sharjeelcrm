'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { syncStripeNow } from '@/lib/actions/sync'
import { Button } from '@/components/ui/button'

export function SyncStripeButton() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            const r = await syncStripeNow()
            if (r.error) toast.error(r.error)
            else toast.success(`Synced — ${r.created} new, ${r.updated} updated`)
            router.refresh()
          } catch {
            toast.error('Sync failed')
          }
        })
      }
    >
      {pending ? 'Syncing…' : 'Sync from Stripe'}
    </Button>
  )
}
