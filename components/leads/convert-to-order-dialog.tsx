'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { convertLeadToOrder } from '@/lib/actions/leads'
import { paymentMethod } from '@/lib/db/schema'
import { titleCase } from '@/lib/labels'
import type { Affiliate } from '@/lib/db/schema'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function ConvertToOrderDialog({
  leadId,
  affiliates,
  defaultPackage,
  defaultPriceDollars,
}: {
  leadId: string
  affiliates: Affiliate[]
  defaultPackage: string
  defaultPriceDollars: string
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [pkg, setPkg] = useState(defaultPackage)
  const [price, setPrice] = useState(defaultPriceDollars)
  const [method, setMethod] = useState<string>('paypal')
  const [affiliateId, setAffiliateId] = useState<string>('none')

  function submit() {
    if (!pkg.trim()) return toast.error('Package is required')
    if (!price || Number(price) <= 0) return toast.error('Enter a valid price')
    startTransition(async () => {
      try {
        // convertLeadToOrder redirects on success; a thrown redirect is expected.
        await convertLeadToOrder(leadId, {
          package: pkg,
          priceDollars: price,
          paymentMethod: method as (typeof paymentMethod.enumValues)[number],
          affiliateId: affiliateId === 'none' ? null : affiliateId,
        })
      } catch (err) {
        // Next's redirect throws a control-flow error we must not swallow as failure.
        if (err && typeof err === 'object' && 'digest' in err && String((err as { digest?: string }).digest).startsWith('NEXT_REDIRECT')) {
          return
        }
        toast.error('Could not convert lead')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button>Convert to order</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convert to order</DialogTitle>
          <DialogDescription>
            Creates a paid order and marks the ticket won. Money is computed automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="pkg">Package *</Label>
            <Input id="pkg" value={pkg} onChange={(e) => setPkg(e.target.value)} placeholder="Starter Shop" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="price">Price ($) *</Label>
              <Input
                id="price"
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="250"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Payment method</Label>
              <Select value={method} onValueChange={(v) => setMethod(v ?? 'paypal')}>
                <SelectTrigger>
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
          </div>
          <div className="space-y-1.5">
            <Label>Affiliate (optional)</Label>
            <Select value={affiliateId} onValueChange={(v) => setAffiliateId(v ?? 'none')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {affiliates.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} ({(Number(a.commissionRate) * 100).toFixed(0)}%)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? 'Converting…' : 'Create order'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
