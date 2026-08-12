'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { setLeadStatus } from '@/lib/actions/leads'
import { titleCase } from '@/lib/labels'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// `paid` is reached only via Convert to order; offer the rest of the machine.
const SELECTABLE = [
  'new_lead',
  'contacted',
  'ticket_opened',
  'interested',
  'invoice_sent',
  'lost',
] as const

export function LeadStatusChanger({ leadId, status }: { leadId: string; status: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  if (status === 'paid') {
    return <p className="text-sm">Paid</p>
  }

  function onChange(next: string | null) {
    if (!next) return
    startTransition(async () => {
      try {
        await setLeadStatus(leadId, next as (typeof SELECTABLE)[number])
        toast.success(`Moved to ${titleCase(next)}`)
        router.refresh()
      } catch {
        toast.error('Could not update status')
      }
    })
  }

  return (
    <Select value={status} onValueChange={onChange} disabled={pending}>
      <SelectTrigger className="w-[200px]">
        <SelectValue />
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
