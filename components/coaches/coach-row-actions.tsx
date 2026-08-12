'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { setCoachStatus, generateLoginCode } from '@/lib/actions/coaches'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const STATUSES = ['active', 'paused', 'banned'] as const

export function CoachRowActions({
  coachId,
  status,
  hasCode,
}: {
  coachId: string
  status: string
  hasCode: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [code, setCode] = useState<string | null>(null)

  function changeStatus(next: string | null) {
    if (!next || next === status) return
    startTransition(async () => {
      try {
        await setCoachStatus(coachId, next as (typeof STATUSES)[number])
        toast.success(`Status: ${next}`)
        router.refresh()
      } catch {
        toast.error('Could not update status')
      }
    })
  }

  function rotate() {
    startTransition(async () => {
      try {
        const c = await generateLoginCode(coachId)
        setCode(c)
        router.refresh()
      } catch {
        toast.error('Could not generate code')
      }
    })
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <Select value={status} onValueChange={changeStatus} disabled={pending}>
        <SelectTrigger className="h-8 w-[110px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" variant="outline" onClick={rotate} disabled={pending}>
        {hasCode ? 'Rotate code' : 'Login code'}
      </Button>

      <Dialog open={code != null} onOpenChange={(o) => !o && setCode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Login code</DialogTitle>
            <DialogDescription>
              Share this with the coach. It is shown once and cannot be read back — only its hash
              is stored. Rotate to replace it.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-muted px-4 py-3 text-center font-mono text-xl tracking-[0.25em]">
            {code}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
