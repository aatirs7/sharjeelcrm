'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { requestPayout, approvePayoutRequest, rejectPayoutRequest } from '@/lib/actions/payout-requests'
import { formatCents } from '@/lib/money'
import { Button } from '@/components/ui/button'

export function RequestPayoutButton({ availableCents, hasPending }: { availableCents: number; hasPending: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function run() {
    startTransition(async () => {
      try {
        await requestPayout()
        toast.success('Payout requested')
        router.refresh()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not request')
      }
    })
  }

  if (hasPending) {
    return <span className="text-sm text-muted-foreground">Payout request pending review</span>
  }
  return (
    <Button onClick={run} disabled={pending || availableCents <= 0}>
      {availableCents > 0 ? `Request payout (${formatCents(availableCents)})` : 'Nothing to request'}
    </Button>
  )
}

export function PayoutRequestActions({ id }: { id: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const act = (fn: () => Promise<void>, ok: string) =>
    startTransition(async () => {
      try {
        await fn()
        toast.success(ok)
        router.refresh()
      } catch {
        toast.error('Could not update')
      }
    })
  return (
    <div className="flex items-center justify-end gap-2">
      <Button size="sm" disabled={pending} onClick={() => act(() => approvePayoutRequest(id), 'Approved + paid')}>
        Approve & pay
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => rejectPayoutRequest(id), 'Rejected')}>
        Reject
      </Button>
    </div>
  )
}
