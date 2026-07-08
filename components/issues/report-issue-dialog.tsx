'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createIssue } from '@/lib/actions/issues'
import { issueType } from '@/lib/db/schema'
import { titleCase } from '@/lib/labels'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function ReportIssueDialog({ orderId }: { orderId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [type, setType] = useState<string>('login_issue')
  const [notes, setNotes] = useState('')

  function submit() {
    startTransition(async () => {
      try {
        await createIssue({
          orderId,
          issueType: type as (typeof issueType.enumValues)[number],
          resolutionNotes: notes || null,
        })
        toast.success('Issue opened')
        setOpen(false)
        setNotes('')
        router.refresh()
      } catch {
        toast.error('Could not open issue')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline">Report issue</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report an issue</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v ?? 'login_issue')}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {issueType.enumValues.map((t) => (
                  <SelectItem key={t} value={t}>
                    {titleCase(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="issue-notes">Notes</Label>
            <Textarea
              id="issue-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What went wrong…"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Whether the order is inside its warranty window is snapshotted automatically.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? 'Opening…' : 'Open issue'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
