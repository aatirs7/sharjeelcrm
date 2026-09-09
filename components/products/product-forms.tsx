'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createProduct, updateProduct } from '@/lib/actions/products'
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

export function ProductDialog({
  mode,
  product,
  trigger,
}: {
  mode: 'create' | 'edit'
  product?: { id: string; name: string; category: string | null; priceCents: number; description: string | null }
  trigger: React.ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState(product?.name ?? '')
  const [category, setCategory] = useState(product?.category ?? '')
  const [price, setPrice] = useState(product ? (product.priceCents / 100).toString() : '')
  const [desc, setDesc] = useState(product?.description ?? '')

  function submit() {
    if (!name.trim()) return toast.error('Name is required')
    startTransition(async () => {
      try {
        const payload = { name, category: category || null, priceDollars: price || null, description: desc || null }
        if (mode === 'create') await createProduct(payload)
        else await updateProduct(product!.id, payload)
        toast.success(mode === 'create' ? 'Product added' : 'Saved')
        setOpen(false)
        router.refresh()
      } catch {
        toast.error('Could not save product')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'New product' : 'Edit product'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="p-name">Name *</Label>
            <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Starter Shop" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="p-cat">Category</Label>
              <Input id="p-cat" value={category} onChange={(e) => setCategory(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-price">Price ($)</Label>
              <Input id="p-price" type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-desc">Description</Label>
            <Input id="p-desc" value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? 'Saving…' : mode === 'create' ? 'Add product' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ToggleActive({ id, active }: { id: string; active: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            await updateProduct(id, { active: !active })
            router.refresh()
          } catch {
            toast.error('Could not update')
          }
        })
      }
    >
      {active ? 'Deactivate' : 'Activate'}
    </Button>
  )
}
