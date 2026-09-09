'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { assignInventoryToOrder, releaseInventory } from '@/lib/actions/products'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function InventoryAttach({
  orderId,
  attached,
  available,
}: {
  orderId: string
  attached: { id: string; label: string }[]
  available: { id: string; label: string }[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [pick, setPick] = useState<string>('')

  function attach() {
    if (!pick) return
    startTransition(async () => {
      try {
        await assignInventoryToOrder(pick, orderId)
        toast.success('Item attached')
        setPick('')
        router.refresh()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not attach')
      }
    })
  }
  function release(id: string) {
    startTransition(async () => {
      try {
        await releaseInventory(id)
        router.refresh()
      } catch {
        toast.error('Could not release')
      }
    })
  }

  return (
    <div className="space-y-2 text-sm">
      {attached.length === 0 ? (
        <p className="text-muted-foreground">No inventory attached.</p>
      ) : (
        <ul className="space-y-1">
          {attached.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs">{i.label}</span>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => release(i.id)}>
                Release
              </Button>
            </li>
          ))}
        </ul>
      )}
      {available.length > 0 && (
        <div className="flex items-center gap-2 pt-1">
          <Select value={pick} onValueChange={(v) => setPick(v ?? '')}>
            <SelectTrigger className="h-8 w-[200px]">
              <SelectValue placeholder="Attach available item" />
            </SelectTrigger>
            <SelectContent>
              {available.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" disabled={pending || !pick} onClick={attach}>
            Attach
          </Button>
        </div>
      )}
    </div>
  )
}
