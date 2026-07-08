'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { markCommissionPaid } from '@/lib/actions/affiliates'
import { Button } from '@/components/ui/button'

export function MarkCommissionPaid({ affiliateId, owedCents }: { affiliateId: string; owedCents: number }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function run() {
    startTransition(async () => {
      try {
        await markCommissionPaid(affiliateId)
        toast.success('Commission marked paid')
        router.refresh()
      } catch {
        toast.error('Could not mark paid')
      }
    })
  }

  return (
    <Button size="sm" variant="outline" disabled={pending || owedCents <= 0} onClick={run}>
      {owedCents <= 0 ? 'Settled' : 'Mark paid'}
    </Button>
  )
}
