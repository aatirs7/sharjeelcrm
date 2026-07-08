'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createAffiliate, updateAffiliate } from '@/lib/actions/affiliates'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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

export function AffiliateFormDialog({
  mode,
  affiliate,
  trigger,
}: {
  mode: 'create' | 'edit'
  affiliate?: {
    id: string
    name: string
    discordUsername: string | null
    commissionRate: string
    notes: string | null
  }
  trigger: React.ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState(affiliate?.name ?? '')
  const [discord, setDiscord] = useState(affiliate?.discordUsername ?? '')
  const [percent, setPercent] = useState(
    affiliate ? (Number(affiliate.commissionRate) * 100).toString() : '10'
  )
  const [notes, setNotes] = useState(affiliate?.notes ?? '')

  function submit() {
    if (!name.trim()) return toast.error('Name is required')
    startTransition(async () => {
      try {
        const payload = {
          name,
          discordUsername: discord || null,
          commissionRatePercent: percent || null,
          notes: notes || null,
        }
        if (mode === 'create') await createAffiliate(payload)
        else await updateAffiliate(affiliate!.id, payload)
        toast.success(mode === 'create' ? 'Affiliate added' : 'Affiliate updated')
        setOpen(false)
        router.refresh()
      } catch {
        toast.error('Could not save affiliate')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'New affiliate' : 'Edit affiliate'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="aff-name">Name *</Label>
            <Input id="aff-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="aff-discord">Discord</Label>
              <Input id="aff-discord" value={discord} onChange={(e) => setDiscord(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="aff-rate">Commission %</Label>
              <Input
                id="aff-rate"
                type="number"
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="aff-notes">Notes</Label>
            <Textarea id="aff-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? 'Saving…' : mode === 'create' ? 'Add affiliate' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
