'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { leadStatus } from '@/lib/db/schema'
import { titleCase } from '@/lib/labels'
import type { Rep } from '@/lib/db/schema'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function LeadsFilters({
  reps,
  status,
  rep,
}: {
  reps: Rep[]
  status: string
  rep: string
}) {
  const router = useRouter()
  const params = useSearchParams()

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString())
    if (value === 'all') next.delete(key)
    else next.set(key, value)
    router.push(`/leads?${next.toString()}`)
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <Select value={status} onValueChange={(v) => setParam('status', v ?? 'all')}>
        <SelectTrigger className="w-full sm:w-[180px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          {leadStatus.enumValues.map((s) => (
            <SelectItem key={s} value={s}>
              {titleCase(s)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={rep} onValueChange={(v) => setParam('rep', v ?? 'all')}>
        <SelectTrigger className="w-full sm:w-[200px]">
          <SelectValue placeholder="Rep" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All reps</SelectItem>
          {reps.map((r) => (
            <SelectItem key={r.id} value={r.id}>
              {r.displayName ?? r.email ?? r.id}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
