'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { updateLeadFields } from '@/lib/actions/leads'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function LeadEmail({ leadId, email }: { leadId: string; email: string }) {
  const router = useRouter()
  const [value, setValue] = useState(email)
  const [pending, startTransition] = useTransition()
  const dirty = value.trim() !== email

  function save() {
    startTransition(async () => {
      try {
        await updateLeadFields(leadId, { email: value })
        toast.success('Email saved')
        router.refresh()
      } catch {
        toast.error('Could not save email')
      }
    })
  }

  return (
    <div className="flex gap-2">
      <Input
        type="email"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="buyer@email.com"
      />
      <Button size="sm" variant="outline" onClick={save} disabled={!dirty || pending}>
        Save
      </Button>
    </div>
  )
}
