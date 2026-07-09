'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { orderStatus, paymentStatus, deliveryStatus } from '@/lib/db/schema'
import { titleCase } from '@/lib/labels'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function OrdersFilters({
  status,
  payment,
  delivery,
}: {
  status: string
  payment: string
  delivery: string
}) {
  const router = useRouter()
  const params = useSearchParams()

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString())
    if (value === 'all') next.delete(key)
    else next.set(key, value)
    router.push(`/orders?${next.toString()}`)
  }

  const groups: { key: string; value: string; label: string; options: readonly string[] }[] = [
    { key: 'status', value: status, label: 'All statuses', options: orderStatus.enumValues },
    { key: 'payment', value: payment, label: 'All payments', options: paymentStatus.enumValues },
    { key: 'delivery', value: delivery, label: 'All delivery', options: deliveryStatus.enumValues },
  ]

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      {groups.map((g) => (
        <Select key={g.key} value={g.value} onValueChange={(v) => setParam(g.key, v ?? 'all')}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{g.label}</SelectItem>
            {g.options.map((o) => (
              <SelectItem key={o} value={o}>
                {titleCase(o)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}
    </div>
  )
}
