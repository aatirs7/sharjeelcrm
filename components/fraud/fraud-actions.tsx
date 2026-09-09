'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { setFraudStatus } from '@/lib/actions/fraud'
import { Button } from '@/components/ui/button'

export function FraudActions({ id }: { id: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const act = (status: 'reviewed' | 'dismissed') =>
    startTransition(async () => {
      try {
        await setFraudStatus(id, status)
        router.refresh()
      } catch {
        toast.error('Could not update')
      }
    })
  return (
    <div className="flex items-center justify-end gap-2">
      <Button size="sm" variant="outline" disabled={pending} onClick={() => act('reviewed')}>
        Mark reviewed
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => act('dismissed')}>
        Dismiss
      </Button>
    </div>
  )
}
