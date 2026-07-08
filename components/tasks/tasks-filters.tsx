'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { taskStatus, taskType } from '@/lib/db/schema'
import { titleCase } from '@/lib/labels'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function TasksFilters({ status, type }: { status: string; type: string }) {
  const router = useRouter()
  const params = useSearchParams()

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString())
    if (value === 'all') next.delete(key)
    else next.set(key, value)
    router.push(`/tasks?${next.toString()}`)
  }

  const groups = [
    { key: 'status', value: status, label: 'All statuses', options: taskStatus.enumValues },
    { key: 'type', value: type, label: 'All types', options: taskType.enumValues },
  ]

  return (
    <div className="flex flex-wrap items-center gap-2">
      {groups.map((g) => (
        <Select key={g.key} value={g.value} onValueChange={(v) => setParam(g.key, v ?? 'all')}>
          <SelectTrigger className="w-[180px]">
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
