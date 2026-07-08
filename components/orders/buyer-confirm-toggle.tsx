'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { setBuyerConfirmed } from '@/lib/actions/orders'
import { Button } from '@/components/ui/button'

export function BuyerConfirmToggle({
  orderId,
  confirmed,
  confirmedAt,
}: {
  orderId: string
  confirmed: boolean
  confirmedAt: Date | string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function toggle() {
    startTransition(async () => {
      try {
        await setBuyerConfirmed(orderId, !confirmed)
        toast.success(!confirmed ? 'Buyer confirmed' : 'Confirmation cleared')
        router.refresh()
      } catch {
        toast.error('Could not update confirmation')
      }
    })
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-sm">
        <span className="text-muted-foreground">Buyer confirmed</span>{' '}
        <span className={confirmed ? 'text-emerald-600 dark:text-emerald-400' : ''}>
          {confirmed
            ? `Yes${confirmedAt ? ` · ${new Date(confirmedAt).toLocaleDateString()}` : ''}`
            : 'No'}
        </span>
      </div>
      <Button size="sm" variant={confirmed ? 'outline' : 'default'} onClick={toggle} disabled={pending}>
        {confirmed ? 'Clear' : 'Mark confirmed'}
      </Button>
    </div>
  )
}
