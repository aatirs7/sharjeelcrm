'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createContent } from '@/lib/actions/content'
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

export function ContentFormDialog({ coaches }: { coaches: { id: string; name: string }[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [coachId, setCoachId] = useState(coaches[0]?.id ?? '')
  const [video, setVideo] = useState('')
  const [views, setViews] = useState('')
  const [comments, setComments] = useState('')
  const [dms, setDms] = useState('')
  const [leads, setLeads] = useState('')
  const [tickets, setTickets] = useState('')
  const [buyers, setBuyers] = useState('')
  const [revenue, setRevenue] = useState('')

  function submit() {
    if (!coachId) return toast.error('Pick a coach')
    startTransition(async () => {
      try {
        await createContent({
          coachId,
          videoLink: video || null,
          views,
          comments,
          dms,
          leadsGenerated: leads,
          ticketsOpened: tickets,
          buyers,
          revenueDollars: revenue,
        })
        toast.success('Content logged')
        setOpen(false)
        setVideo('')
        router.refresh()
      } catch {
        toast.error('Could not save content')
      }
    })
  }

  const num = (v: string, set: (s: string) => void, label: string, id: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" value={v} onChange={(e) => set(e.target.value)} />
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button>Log content</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log content</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Coach</Label>
            <Select value={coachId} onValueChange={(v) => setCoachId(v ?? '')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {coaches.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ct-video">Video link</Label>
            <Input id="ct-video" value={video} onChange={(e) => setVideo(e.target.value)} placeholder="https://tiktok.com/..." />
          </div>
          <div className="grid grid-cols-3 gap-3">
            {num(views, setViews, 'Views', 'ct-views')}
            {num(comments, setComments, 'Comments', 'ct-comments')}
            {num(dms, setDms, 'DMs', 'ct-dms')}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {num(leads, setLeads, 'Leads', 'ct-leads')}
            {num(tickets, setTickets, 'Tickets', 'ct-tickets')}
            {num(buyers, setBuyers, 'Buyers', 'ct-buyers')}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ct-rev">Revenue ($)</Label>
            <Input id="ct-rev" type="number" value={revenue} onChange={(e) => setRevenue(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
