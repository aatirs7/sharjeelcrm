'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { updateOrderPayment } from '@/lib/actions/orders'
import { paymentMethod, paymentStatus } from '@/lib/db/schema'
import { titleCase } from '@/lib/labels'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function OrderPaymentForm({
  orderId,
  paymentMethod: method,
  paymentStatus: status,
  transactionId,
  paymentLink,
}: {
  orderId: string
  paymentMethod: string | null
  paymentStatus: string
  transactionId: string
  paymentLink: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [pm, setPm] = useState<string>(method ?? 'paypal')
  const [ps, setPs] = useState<string>(status)
  const [txn, setTxn] = useState(transactionId)
  const [link, setLink] = useState(paymentLink)

  function save() {
    startTransition(async () => {
      try {
        await updateOrderPayment(orderId, {
          paymentMethod: pm as (typeof paymentMethod.enumValues)[number],
          paymentStatus: ps as (typeof paymentStatus.enumValues)[number],
          transactionId: txn,
          paymentLink: link,
        })
        toast.success('Payment updated')
        router.refresh()
      } catch {
        toast.error('Could not update payment')
      }
    })
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Method</Label>
          <Select value={pm} onValueChange={(v) => setPm(v ?? 'paypal')}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {paymentMethod.enumValues.map((m) => (
                <SelectItem key={m} value={m}>
                  {titleCase(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={ps} onValueChange={(v) => setPs(v ?? status)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {paymentStatus.enumValues.map((s) => (
                <SelectItem key={s} value={s}>
                  {titleCase(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="txn">Transaction ID</Label>
        <Input id="txn" value={txn} onChange={(e) => setTxn(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="link">Payment link</Label>
        <Input id="link" value={link} onChange={(e) => setLink(e.target.value)} />
      </div>
      <div className="flex justify-end">
        <Button size="sm" onClick={save} disabled={pending}>
          {pending ? 'Saving…' : 'Save payment'}
        </Button>
      </div>
    </div>
  )
}
