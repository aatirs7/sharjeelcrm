'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createCoach, updateCoach } from '@/lib/actions/coaches'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const TIERS = ['bronze', 'silver', 'gold'] as const

export function CoachFormDialog({
  mode,
  coach,
  trigger,
}: {
  mode: 'create' | 'edit'
  coach?: {
    id: string
    name: string
    coachCode: string | null
    promoCode: string | null
    discordUsername: string | null
    commissionRate: string
    tier: string
    payoutMethod: string | null
    trackingLink: string | null
    notes: string | null
  }
  trigger: React.ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState(coach?.name ?? '')
  const [promo, setPromo] = useState(coach?.promoCode ?? '')
  const [handle, setHandle] = useState(coach?.coachCode ?? '')
  const [discord, setDiscord] = useState(coach?.discordUsername ?? '')
  const [percent, setPercent] = useState(coach ? (Number(coach.commissionRate) * 100).toString() : '10')
  const [tier, setTier] = useState(coach?.tier ?? 'bronze')
  const [method, setMethod] = useState(coach?.payoutMethod ?? '')
  const [link, setLink] = useState(coach?.trackingLink ?? '')
  const [notes, setNotes] = useState(coach?.notes ?? '')

  function submit() {
    if (!name.trim()) return toast.error('Name is required')
    startTransition(async () => {
      try {
        const payload = {
          name,
          coachCode: handle || null,
          promoCode: promo || null,
          discordUsername: discord || null,
          commissionRatePercent: percent || null,
          tier: tier as (typeof TIERS)[number],
          payoutMethod: method || null,
          trackingLink: link || null,
          notes: notes || null,
        }
        if (mode === 'create') await createCoach(payload)
        else await updateCoach(coach!.id, payload)
        toast.success(mode === 'create' ? 'Coach added' : 'Coach updated')
        setOpen(false)
        router.refresh()
      } catch {
        toast.error('Could not save coach')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'New coach' : 'Edit coach'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="co-name">Name *</Label>
            <Input id="co-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="co-promo">Promo code</Label>
              <Input id="co-promo" value={promo} onChange={(e) => setPromo(e.target.value)} placeholder="ISHHY100" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="co-handle">Handle</Label>
              <Input id="co-handle" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="ishhy-printss" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="co-rate">Commission %</Label>
              <Input id="co-rate" type="number" value={percent} onChange={(e) => setPercent(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Tier</Label>
              <Select value={tier} onValueChange={(v) => setTier(v ?? 'bronze')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIERS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="co-discord">Discord</Label>
              <Input id="co-discord" value={discord} onChange={(e) => setDiscord(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="co-method">Payout method</Label>
              <Input id="co-method" value={method} onChange={(e) => setMethod(e.target.value)} placeholder="paypal" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="co-link">Tracking link</Label>
            <Input id="co-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://..." />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="co-notes">Notes</Label>
            <Textarea id="co-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? 'Saving…' : mode === 'create' ? 'Add coach' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
