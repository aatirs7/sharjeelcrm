'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { replacementStatus } from '@/lib/db/schema'
import { titleCase } from '@/lib/labels'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function IssuesFilters({ replacement }: { replacement: string }) {
  const router = useRouter()
  const params = useSearchParams()

  function setParam(value: string) {
    const next = new URLSearchParams(params.toString())
    if (value === 'all') next.delete('replacement')
    else next.set('replacement', value)
    router.push(`/issues?${next.toString()}`)
  }

  return (
    <Select value={replacement} onValueChange={(v) => setParam(v ?? 'all')}>
      <SelectTrigger className="w-[220px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All replacement statuses</SelectItem>
        {replacementStatus.enumValues.map((r) => (
          <SelectItem key={r} value={r}>
            {titleCase(r)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
