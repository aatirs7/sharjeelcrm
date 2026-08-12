'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { payoutCoach } from '@/lib/actions/payouts'
import { formatCents } from '@/lib/money'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

export function PayCoachDialog({
  coachId,
  coachName,
  amountCents,
  count,
  defaultMethod,
}: {
  coachId: string
  coachName: string
  amountCents: number
  count: number
  defaultMethod: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [method, setMethod] = useState(defaultMethod ?? '')
  const [ref, setRef] = useState('')

  function submit() {
    startTransition(async () => {
      try {
        const id = await payoutCoach(coachId, { method, transactionRef: ref })
        if (id) {
          toast.success(`Paid ${formatCents(amountCents)} to ${coachName}`)
          setOpen(false)
          router.refresh()
        } else {
          toast.error('Nothing approved to pay')
        }
      } catch {
        toast.error('Could not record payout')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" disabled={amountCents <= 0}>
            {amountCents > 0 ? `Pay ${formatCents(amountCents)}` : 'Nothing due'}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pay out {coachName}</DialogTitle>
          <DialogDescription>
            Batches {count} approved commission{count === 1 ? '' : 's'} totalling{' '}
            {formatCents(amountCents)} into one paid payout.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="po-method">Method</Label>
            <Input id="po-method" value={method} onChange={(e) => setMethod(e.target.value)} placeholder="paypal" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="po-ref">Transaction ref / proof</Label>
            <Input id="po-ref" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="txn id or proof url" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || amountCents <= 0}>
            {pending ? 'Recording…' : 'Mark paid'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
