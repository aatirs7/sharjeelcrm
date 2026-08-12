'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { assignOrderCoach } from '@/lib/actions/orders'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function AssignCoachControl({
  orderId,
  coachId,
  coaches,
}: {
  orderId: string
  coachId: string | null
  coaches: { id: string; name: string; promoCode: string | null }[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function onChange(next: string | null) {
    const value = !next || next === 'none' ? null : next
    startTransition(async () => {
      try {
        await assignOrderCoach(orderId, value)
        toast.success(value ? 'Coach assigned' : 'Coach cleared')
        router.refresh()
      } catch {
        toast.error('Could not assign coach')
      }
    })
  }

  return (
    <Select value={coachId ?? 'none'} onValueChange={onChange} disabled={pending}>
      <SelectTrigger className="w-[220px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Unattributed</SelectItem>
        {coaches.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
            {c.promoCode ? ` (${c.promoCode})` : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
