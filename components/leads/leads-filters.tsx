'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { leadStatus, leadSource } from '@/lib/db/schema'
import { titleCase } from '@/lib/labels'
import type { Rep } from '@/lib/db/schema'
import { Input } from '@/components/ui/input'
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
  code,
  source = 'all',
  product = 'all',
  products = [],
}: {
  reps: Rep[]
  status: string
  rep: string
  code: string
  source?: string
  product?: string
  products?: { id: string; name: string }[]
}) {
  const router = useRouter()
  const params = useSearchParams()

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString())
    if (value === 'all' || value === '') next.delete(key)
    else next.set(key, value)
    router.push(`/tickets?${next.toString()}`)
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

      <Select value={source} onValueChange={(v) => setParam('source', v ?? 'all')}>
        <SelectTrigger className="w-full sm:w-[160px]">
          <SelectValue placeholder="Source" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All sources</SelectItem>
          {leadSource.enumValues.map((s) => (
            <SelectItem key={s} value={s}>
              {titleCase(s)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {products.length > 0 && (
        <Select value={product} onValueChange={(v) => setParam('product', v ?? 'all')}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Product" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All products</SelectItem>
            {products.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Input
        defaultValue={code}
        placeholder="Referral code…"
        className="w-full font-mono sm:w-[160px]"
        onKeyDown={(e) => {
          if (e.key === 'Enter') setParam('code', (e.target as HTMLInputElement).value.trim())
        }}
        onBlur={(e) => setParam('code', e.target.value.trim())}
      />
    </div>
  )
}
