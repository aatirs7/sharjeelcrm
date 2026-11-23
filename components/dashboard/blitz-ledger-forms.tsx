'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  deleteBlitzLedgerEntry,
  recordBlitzBalanceCheck,
  recordBlitzWithdrawal,
  saveBlitzFee,
} from '@/lib/actions/blitz'
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

/** "1,234.56" or "$1234" -> cents, or null when it isn't a money amount. */
function toCents(raw: string): number | null {
  const clean = raw.replace(/[$,\s]/g, '')
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) return null
  return Math.round(parseFloat(clean) * 100)
}

function todayLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function useAction() {
  const router = useRouter()
  const [pending, start] = useTransition()
  function run(fn: () => Promise<void>, ok: string, done?: () => void) {
    start(async () => {
      try {
        await fn()
        toast.success(ok)
        done?.()
        router.refresh()
      } catch (e) {
        toast.error(e instanceof Error && e.message ? e.message : 'Could not save')
      }
    })
  }
  return { pending, run }
}

export function RecordWithdrawalDialog() {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [day, setDay] = useState(todayLocal())
  const [note, setNote] = useState('')
  const { pending, run } = useAction()

  function submit() {
    const c = toCents(amount)
    if (!c) return toast.error('Enter the amount withdrawn')
    run(
      () => recordBlitzWithdrawal({ amountCents: c, day, note }),
      'Withdrawal recorded',
      () => {
        setOpen(false)
        setAmount('')
        setNote('')
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm">Record withdrawal</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a Blitz withdrawal</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Money you moved out of Blitz to your bank. It comes off the Blitz balance here.
        </p>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="bw-amount">Amount</Label>
            <Input id="bw-amount" inputMode="decimal" placeholder="$0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bw-day">Date</Label>
            <Input id="bw-day" type="date" max={todayLocal()} value={day} onChange={(e) => setDay(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bw-note">Note (optional)</Label>
            <Input id="bw-note" placeholder="e.g. to Chase" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? 'Saving…' : 'Record withdrawal'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function MatchBalanceDialog() {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const { pending, run } = useAction()

  function submit() {
    const c = toCents(amount)
    if (c === null) return toast.error('Enter the balance Blitz shows')
    run(
      () => recordBlitzBalanceCheck({ amountCents: c }),
      'Balance matched to Blitz',
      () => {
        setOpen(false)
        setAmount('')
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline">Match to Blitz</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Match the balance to Blitz</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Open Blitz, copy the balance it shows right now and enter it here. The CRM starts counting
          from this number, so fees and anything not recorded are corrected.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="bm-amount">Balance in Blitz right now</Label>
          <Input id="bm-amount" inputMode="decimal" placeholder="$0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? 'Saving…' : 'Save balance'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function BlitzFeeDialog({ bps }: { bps: number }) {
  const [open, setOpen] = useState(false)
  const [pct, setPct] = useState(bps ? (bps / 100).toFixed(2) : '')
  const { pending, run } = useAction()

  function submit() {
    const v = parseFloat(pct.replace('%', '').trim() || '0')
    if (!Number.isFinite(v) || v < 0 || v > 20) return toast.error('Enter a fee between 0% and 20%')
    run(() => saveBlitzFee(Math.round(v * 100)), 'Blitz fee saved', () => setOpen(false))
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="ghost">
            {bps ? `Fee ${(bps / 100).toFixed(2)}%` : 'Set Blitz fee'}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Blitz fee per sale</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          The percentage Blitz keeps from each card sale. The CRM takes it off new sales so the
          balance stays close to what Blitz shows between matches.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="bf-pct">Fee (%)</Label>
          <Input id="bf-pct" inputMode="decimal" placeholder="2.9" value={pct} onChange={(e) => setPct(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? 'Saving…' : 'Save fee'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function RemoveLedgerEntryButton({ id }: { id: string }) {
  const [confirming, setConfirming] = useState(false)
  const { pending, run } = useAction()
  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="font-mono text-[11px] text-muted-foreground hover:text-destructive"
      >
        remove
      </button>
    )
  }
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[11px]">
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => deleteBlitzLedgerEntry(id), 'Removed')}
        className="text-destructive"
      >
        {pending ? 'removing…' : 'confirm'}
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="text-muted-foreground">
        keep
      </button>
    </span>
  )
}
