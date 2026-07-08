'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { updateLeadFields } from '@/lib/actions/leads'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

export function LeadNotes({ leadId, notes }: { leadId: string; notes: string }) {
  const router = useRouter()
  const [value, setValue] = useState(notes)
  const [pending, startTransition] = useTransition()
  const dirty = value !== notes

  function save() {
    startTransition(async () => {
      try {
        await updateLeadFields(leadId, { notes: value })
        toast.success('Notes saved')
        router.refresh()
      } catch {
        toast.error('Could not save notes')
      }
    })
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={5}
        placeholder="Add notes about this lead…"
      />
      <div className="flex justify-end">
        <Button size="sm" onClick={save} disabled={!dirty || pending}>
          {pending ? 'Saving…' : 'Save notes'}
        </Button>
      </div>
    </div>
  )
}
