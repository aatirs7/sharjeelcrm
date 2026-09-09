'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { saveLeaderboardRewards, saveRepeatCommission } from '@/lib/actions/settings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function RewardsForm({ first, second, third }: { first: number; second: number; third: number }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [a, setA] = useState((first / 100).toString())
  const [b, setB] = useState((second / 100).toString())
  const [c, setC] = useState((third / 100).toString())

  function save() {
    startTransition(async () => {
      try {
        await saveLeaderboardRewards({ first: a, second: b, third: c })
        toast.success('Rewards saved')
        router.refresh()
      } catch {
        toast.error('Could not save')
      }
    })
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        {[
          ['1st place ($)', a, setA],
          ['2nd place ($)', b, setB],
          ['3rd place ($)', c, setC],
        ].map(([label, val, set], i) => (
          <div key={i} className="space-y-1.5">
            <Label>{label as string}</Label>
            <Input
              type="number"
              value={val as string}
              onChange={(e) => (set as (s: string) => void)(e.target.value)}
            />
          </div>
        ))}
      </div>
      <Button onClick={save} disabled={pending}>
        {pending ? 'Saving…' : 'Save rewards'}
      </Button>
    </div>
  )
}

export function RepeatForm({ mode }: { mode: 'first_only' | 'every_purchase' }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [val, setVal] = useState(mode)

  function save(next: string | null) {
    const m = (next ?? 'first_only') as 'first_only' | 'every_purchase'
    setVal(m)
    startTransition(async () => {
      try {
        await saveRepeatCommission(m)
        toast.success('Saved')
        router.refresh()
      } catch {
        toast.error('Could not save')
      }
    })
  }

  return (
    <Select value={val} onValueChange={save} disabled={pending}>
      <SelectTrigger className="w-[260px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="first_only">First purchase only</SelectItem>
        <SelectItem value="every_purchase">Every purchase</SelectItem>
      </SelectContent>
    </Select>
  )
}
