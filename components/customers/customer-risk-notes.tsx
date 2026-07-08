'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { updateCustomer } from '@/lib/actions/customers'
import { riskStatus } from '@/lib/db/schema'
import { titleCase } from '@/lib/labels'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function CustomerRiskNotes({
  customerId,
  risk,
  notes,
}: {
  customerId: string
  risk: string
  notes: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [riskValue, setRiskValue] = useState(risk)
  const [notesValue, setNotesValue] = useState(notes)
  const dirty = riskValue !== risk || notesValue !== notes

  function save() {
    startTransition(async () => {
      try {
        await updateCustomer(customerId, {
          riskStatus: riskValue as (typeof riskStatus.enumValues)[number],
          notes: notesValue,
        })
        toast.success('Customer updated')
        router.refresh()
      } catch {
        toast.error('Could not update customer')
      }
    })
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Risk status</Label>
        <Select value={riskValue} onValueChange={(v) => setRiskValue(v ?? risk)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {riskStatus.enumValues.map((r) => (
              <SelectItem key={r} value={r}>
                {titleCase(r)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cust-notes">Notes</Label>
        <Textarea
          id="cust-notes"
          rows={4}
          value={notesValue}
          onChange={(e) => setNotesValue(e.target.value)}
          placeholder="Internal notes about this customer…"
        />
      </div>
      <div className="flex justify-end">
        <Button size="sm" onClick={save} disabled={!dirty || pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  )
}
