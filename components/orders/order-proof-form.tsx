'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { setDeliveryProof } from '@/lib/actions/orders'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function OrderProofForm({ orderId, proofUrl }: { orderId: string; proofUrl: string }) {
  const router = useRouter()
  const [value, setValue] = useState(proofUrl)
  const [pending, startTransition] = useTransition()
  const dirty = value !== proofUrl

  function save() {
    startTransition(async () => {
      try {
        await setDeliveryProof(orderId, value || null)
        toast.success('Proof saved')
        router.refresh()
      } catch {
        toast.error('Could not save proof')
      }
    })
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor="proof">Delivery proof URL</Label>
      <div className="flex gap-2">
        <Input
          id="proof"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://…"
        />
        <Button size="sm" variant="outline" onClick={save} disabled={!dirty || pending}>
          Save
        </Button>
      </div>
    </div>
  )
}
