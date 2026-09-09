'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

/**
 * The shareable self-serve signup link. A coach opens it, picks a name + promo
 * code, and signs in with Discord to become active — no manual entry needed.
 */
export function CoachInviteLink() {
  const [url, setUrl] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setUrl(`${window.location.origin}/coach/join`)
  }, [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked; the link is still visible to copy by hand */
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium">Invite a coach</p>
        <p className="truncate font-mono text-xs text-muted-foreground">{url || '…'}</p>
      </div>
      <Button type="button" variant="outline" onClick={copy} disabled={!url} className="shrink-0">
        {copied ? 'Copied' : 'Copy invite link'}
      </Button>
    </div>
  )
}
