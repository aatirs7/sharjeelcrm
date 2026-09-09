'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createInventoryItem, setInventoryStatus } from '@/lib/actions/products'
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

const STATUSES = ['available', 'reserved', 'sold', 'unavailable'] as const

export function AddInventoryDialog({ products }: { products: { id: string; name: string }[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [productId, setProductId] = useState<string>('none')
  const [label, setLabel] = useState('')
  const [creds, setCreds] = useState('')
  const [notes, setNotes] = useState('')

  function submit() {
    if (!label.trim()) return toast.error('Label is required')
    startTransition(async () => {
      try {
        await createInventoryItem({
          productId: productId === 'none' ? null : productId,
          label,
          credentials: creds || null,
          notes: notes || null,
        })
        toast.success('Item added')
        setOpen(false)
        setLabel('')
        setCreds('')
        router.refresh()
      } catch {
        toast.error('Could not add item')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button>Add item</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New inventory item</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Product</Label>
            <Select value={productId} onValueChange={(v) => setProductId(v ?? 'none')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="i-label">Label *</Label>
            <Input id="i-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="USA Shop #A-102" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="i-creds">Credentials (private, staff only)</Label>
            <Textarea id="i-creds" rows={2} value={creds} onChange={(e) => setCreds(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="i-notes">Notes</Label>
            <Input id="i-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? 'Adding…' : 'Add item'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function InventoryStatusSelect({ id, status }: { id: string; status: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <Select
      value={status}
      onValueChange={(v) =>
        v &&
        startTransition(async () => {
          try {
            await setInventoryStatus(id, v as (typeof STATUSES)[number])
            router.refresh()
          } catch {
            toast.error('Could not update')
          }
        })
      }
      disabled={pending}
    >
      <SelectTrigger className="h-8 w-[130px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            {s}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
