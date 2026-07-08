'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { riskStatus } from '@/lib/db/schema'
import { titleCase } from '@/lib/labels'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function CustomersFilters({ risk }: { risk: string }) {
  const router = useRouter()
  const params = useSearchParams()

  function setParam(value: string) {
    const next = new URLSearchParams(params.toString())
    if (value === 'all') next.delete('risk')
    else next.set('risk', value)
    router.push(`/customers?${next.toString()}`)
  }

  return (
    <Select value={risk} onValueChange={(v) => setParam(v ?? 'all')}>
      <SelectTrigger className="w-[200px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All risk levels</SelectItem>
        {riskStatus.enumValues.map((r) => (
          <SelectItem key={r} value={r}>
            {titleCase(r)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
