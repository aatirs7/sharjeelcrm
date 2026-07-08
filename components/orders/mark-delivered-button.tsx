'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { markDelivered } from '@/lib/actions/orders'
import { Button } from '@/components/ui/button'

export function MarkDeliveredButton({ orderId }: { orderId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function run() {
    startTransition(async () => {
      try {
        await markDelivered(orderId)
        toast.success('Marked delivered — warranty started')
        router.refresh()
      } catch {
        toast.error('Could not mark delivered')
      }
    })
  }

  return (
    <Button onClick={run} disabled={pending} className="w-full">
      {pending ? 'Marking…' : 'Mark delivered'}
    </Button>
  )
}
