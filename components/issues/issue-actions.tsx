'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { updateIssue, resolveIssue, reopenIssue } from '@/lib/actions/issues'
import { replacementStatus } from '@/lib/db/schema'
import { titleCase } from '@/lib/labels'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function IssueActions({
  issueId,
  replacementStatus: repl,
  resolved,
}: {
  issueId: string
  replacementStatus: string
  resolved: boolean
}) {
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

  return (
    <div className="flex items-center justify-end gap-2">
      <Select
        value={repl}
        disabled={pending || resolved}
        onValueChange={(v) =>
          v &&
          run(
            () => updateIssue(issueId, { replacementStatus: v as (typeof replacementStatus.enumValues)[number] }),
            'Replacement updated'
          )
        }
      >
        <SelectTrigger className="w-[150px]" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {replacementStatus.enumValues.map((r) => (
            <SelectItem key={r} value={r}>
              {titleCase(r)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {resolved ? (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => reopenIssue(issueId), 'Reopened')}>
          Reopen
        </Button>
      ) : (
        <Button size="sm" disabled={pending} onClick={() => run(() => resolveIssue(issueId), 'Resolved')}>
          Resolve
        </Button>
      )}
    </div>
  )
}
