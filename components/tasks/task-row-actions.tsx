'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { completeTask, reopenTask, snoozeTask } from '@/lib/actions/tasks'
import { Button } from '@/components/ui/button'

export function TaskRowActions({ taskId, status }: { taskId: string; status: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function run(fn: () => Promise<void>, msg: string) {
    startTransition(async () => {
      try {
        await fn()
        toast.success(msg)
        router.refresh()
      } catch {
        toast.error('Action failed')
      }
    })
  }

  if (status === 'done') {
    return (
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => reopenTask(taskId), 'Reopened')}>
        Reopen
      </Button>
    )
  }

  return (
    <div className="flex justify-end gap-1">
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => snoozeTask(taskId, 1), 'Snoozed 1 day')}>
        Snooze
      </Button>
      <Button size="sm" disabled={pending} onClick={() => run(() => completeTask(taskId), 'Completed')}>
        Done
      </Button>
    </div>
  )
}
