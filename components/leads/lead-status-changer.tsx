'use client'

import { useState, useTransition } from 'react'
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

// `completed` is reached only via Convert to order; offer the rest of the pipeline.
const SELECTABLE = [
  'new_lead',
  'contacted',
  'product_selected',
  'waiting_payment',
  'payment_received',
  'fulfillment',
  'cancelled',
  'refunded',
  'disputed',
] as const

const LOST_REASONS = [
  'no_response',
  'too_expensive',
  'changed_mind',
  'payment_problem',
  'product_unavailable',
  'bought_elsewhere',
  'other',
] as const

export function LeadStatusChanger({ leadId, status }: { leadId: string; status: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [reason, setReason] = useState<string>('no_response')

  if (status === 'completed') {
    return <p className="text-sm">Completed</p>
  }

  function apply(next: string, lostReason?: string | null) {
    startTransition(async () => {
      try {
        await setLeadStatus(
          leadId,
          next as (typeof SELECTABLE)[number],
          (lostReason ?? null) as (typeof LOST_REASONS)[number] | null
        )
        toast.success(`Moved to ${titleCase(next)}`)
        router.refresh()
      } catch {
        toast.error('Could not update status')
      }
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={status} onValueChange={(v) => v && v !== 'cancelled' && apply(v)} disabled={pending}>
        <SelectTrigger className="w-[190px]">
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

      {/* Cancelling captures a lost reason (spec §23). */}
      {status !== 'cancelled' && (
        <div className="flex items-center gap-2">
          <Select value={reason} onValueChange={(v) => setReason(v ?? 'no_response')} disabled={pending}>
            <SelectTrigger className="w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOST_REASONS.map((r) => (
                <SelectItem key={r} value={r}>
                  {titleCase(r)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={() => apply('cancelled', reason)}
            disabled={pending}
            className="rounded-md border border-rose-300 px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/40"
          >
            Cancel deal
          </button>
        </div>
      )}
    </div>
  )
}
