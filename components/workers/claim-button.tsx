'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { claimDeal } from '@/lib/actions/workers'
import { Button } from '@/components/ui/button'

export function ClaimButton({ leadId, assigned }: { leadId: string; assigned: string | null }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function claim() {
    startTransition(async () => {
      try {
        await claimDeal(leadId)
        toast.success('Deal claimed')
        router.refresh()
      } catch {
        toast.error('Could not claim')
      }
    })
  }

  return (
    <Button size="sm" variant={assigned ? 'ghost' : 'outline'} onClick={claim} disabled={pending}>
      {assigned ? 'Reassign to me' : 'Claim'}
    </Button>
  )
}
