'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { applyBotAvatar, saveCryptoAddresses, saveLeaderboardRewards, saveRepeatCommission } from '@/lib/actions/settings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function RewardsForm({ first, second, third }: { first: number; second: number; third: number }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [a, setA] = useState((first / 100).toString())
  const [b, setB] = useState((second / 100).toString())
  const [c, setC] = useState((third / 100).toString())

  function save() {
    startTransition(async () => {
      try {
        await saveLeaderboardRewards({ first: a, second: b, third: c })
        toast.success('Rewards saved')
        router.refresh()
      } catch {
        toast.error('Could not save')
      }
    })
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        {[
          ['1st place ($)', a, setA],
          ['2nd place ($)', b, setB],
          ['3rd place ($)', c, setC],
        ].map(([label, val, set], i) => (
          <div key={i} className="space-y-1.5">
            <Label>{label as string}</Label>
            <Input
              type="number"
              value={val as string}
              onChange={(e) => (set as (s: string) => void)(e.target.value)}
            />
          </div>
        ))}
      </div>
      <Button onClick={save} disabled={pending}>
        {pending ? 'Saving…' : 'Save rewards'}
      </Button>
    </div>
  )
}

export function RepeatForm({ mode }: { mode: 'first_only' | 'every_purchase' }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [val, setVal] = useState(mode)

  function save(next: string | null) {
    const m = (next ?? 'first_only') as 'first_only' | 'every_purchase'
    setVal(m)
    startTransition(async () => {
      try {
        await saveRepeatCommission(m)
        toast.success('Saved')
        router.refresh()
      } catch {
        toast.error('Could not save')
      }
    })
  }

  return (
    <Select value={val} onValueChange={save} disabled={pending}>
      <SelectTrigger className="w-[260px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="first_only">First purchase only</SelectItem>
        <SelectItem value="every_purchase">Every purchase</SelectItem>
      </SelectContent>
    </Select>
  )
}

/**
 * Discord bot profile picture. One click applies the brand logo; the file
 * picker lets an admin swap in any other png / jpg / gif.
 */
export function BotAvatarForm({ botName }: { botName: string | null }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [file, setFile] = useState<File | null>(null)

  function apply() {
    startTransition(async () => {
      try {
        const fd = new FormData()
        if (file) fd.set('avatar', file)
        await applyBotAvatar(fd)
        toast.success(`${botName ?? 'Bot'} profile picture updated`)
        setFile(null)
        router.refresh()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not change the picture')
      }
    })
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="bot-avatar-file">Or pick a different image</Label>
        <Input
          id="bot-avatar-file"
          type="file"
          accept="image/png,image/jpeg,image/gif"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </div>
      <Button onClick={apply} disabled={pending}>
        {pending ? 'Updating…' : file ? 'Use selected image' : 'Use the SA logo'}
      </Button>
    </div>
  )
}

type WalletRow = { coin: string; network: string; address: string }

/**
 * Crypto wallets the Discord bot posts when a buyer picks "Crypto" in their
 * ticket. Empty list = the buyer is told to wait for the owner's reply.
 */
export function CryptoWalletsForm({ wallets }: { wallets: WalletRow[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [rows, setRows] = useState<WalletRow[]>(
    wallets.length ? wallets : [{ coin: '', network: '', address: '' }]
  )

  function update(i: number, patch: Partial<WalletRow>) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)))
  }

  function save() {
    startTransition(async () => {
      try {
        await saveCryptoAddresses(rows)
        toast.success('Crypto wallets saved')
        router.refresh()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not save')
      }
    })
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-[90px_130px_1fr_auto] items-end gap-2">
            <div className="space-y-1.5">
              {i === 0 && <Label>Coin</Label>}
              <Input
                value={row.coin}
                placeholder="BTC"
                onChange={(e) => update(i, { coin: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              {i === 0 && <Label>Network</Label>}
              <Input
                value={row.network}
                placeholder="optional"
                onChange={(e) => update(i, { network: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              {i === 0 && <Label>Address</Label>}
              <Input
                value={row.address}
                placeholder="wallet address"
                className="font-mono text-xs"
                onChange={(e) => update(i, { address: e.target.value })}
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => setRows((r) => (r.length === 1 ? [{ coin: '', network: '', address: '' }] : r.filter((_, idx) => idx !== i)))}
              aria-label="Remove wallet"
            >
              ✕
            </Button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          type="button"
          onClick={() => setRows((r) => [...r, { coin: '', network: '', address: '' }])}
          disabled={rows.length >= 20}
        >
          Add wallet
        </Button>
        <Button onClick={save} disabled={pending}>
          {pending ? 'Saving…' : 'Save wallets'}
        </Button>
      </div>
    </div>
  )
}
