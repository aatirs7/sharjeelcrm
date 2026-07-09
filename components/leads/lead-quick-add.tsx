'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createLead } from '@/lib/actions/leads'
import { leadSource } from '@/lib/db/schema'
import { titleCase } from '@/lib/labels'
import type { Rep } from '@/lib/db/schema'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

export function LeadQuickAdd({ reps }: { reps: Rep[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [discordUsername, setDiscordUsername] = useState('')
  const [source, setSource] = useState<string>('discord')
  const [interest, setInterest] = useState('')
  const [budget, setBudget] = useState('')
  const [ticketLink, setTicketLink] = useState('')
  const [assignedRepId, setAssignedRepId] = useState<string>('me')

  function submit() {
    if (!discordUsername.trim()) {
      toast.error('Discord username is required')
      return
    }
    startTransition(async () => {
      try {
        await createLead({
          discordUsername,
          source: source as (typeof leadSource.enumValues)[number],
          interest: interest || null,
          budgetDollars: budget || null,
          ticketLink: ticketLink || null,
          assignedRepId: assignedRepId === 'me' ? null : assignedRepId,
        })
        toast.success('Ticket created')
        setOpen(false)
        setDiscordUsername('')
        setInterest('')
        setBudget('')
        setTicketLink('')
        router.refresh()
      } catch {
        toast.error('Could not create ticket')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button>Add ticket</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New ticket</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="discord">Discord username *</Label>
            <Input
              id="discord"
              value={discordUsername}
              onChange={(e) => setDiscordUsername(e.target.value)}
              placeholder="buyer_name"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Source</Label>
              <Select value={source} onValueChange={(v) => setSource(v ?? 'discord')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {leadSource.enumValues.map((s) => (
                    <SelectItem key={s} value={s}>
                      {titleCase(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="budget">Budget ($)</Label>
              <Input
                id="budget"
                type="number"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="250"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="interest">Interest</Label>
            <Input
              id="interest"
              value={interest}
              onChange={(e) => setInterest(e.target.value)}
              placeholder="Starter Shop"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ticket">Ticket link</Label>
            <Input
              id="ticket"
              value={ticketLink}
              onChange={(e) => setTicketLink(e.target.value)}
              placeholder="https://discord.com/channels/…"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Assign to</Label>
            <Select value={assignedRepId} onValueChange={(v) => setAssignedRepId(v ?? 'me')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="me">Me</SelectItem>
                {reps.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.displayName ?? r.email ?? r.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? 'Creating…' : 'Create ticket'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
