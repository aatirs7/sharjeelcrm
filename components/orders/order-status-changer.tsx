'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { setOrderStatus } from '@/lib/actions/orders'
import { titleCase } from '@/lib/labels'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// `delivered` is reached via Mark delivered (sets warranty); offer the rest.
const SELECTABLE = ['paid', 'awaiting_delivery', 'closed', 'refunded', 'chargeback'] as const

export function OrderStatusChanger({ orderId, status }: { orderId: string; status: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function onChange(next: string | null) {
    if (!next) return
    startTransition(async () => {
      try {
        await setOrderStatus(orderId, next as (typeof SELECTABLE)[number])
        toast.success(`Moved to ${titleCase(next)}`)
        router.refresh()
      } catch {
        toast.error('Could not update status')
      }
    })
  }

  const value = status === 'delivered' ? '' : status

  return (
    <Select value={value} onValueChange={onChange} disabled={pending}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={status === 'delivered' ? 'Delivered' : undefined} />
      </SelectTrigger>
      <SelectContent>
        {SELECTABLE.map((s) => (
          <SelectItem key={s} value={s}>
            {titleCase(s)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
