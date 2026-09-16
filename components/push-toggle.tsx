'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/**
 * One button to turn phone alerts on or off. Enabling registers the service
 * worker, asks for notification permission, subscribes this device, and stores
 * it server-side; disabling removes it. Hidden where the browser cannot push.
 */
export function PushToggle() {
  const [supported, setSupported] = useState(false)
  const [on, setOn] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const ok = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    setSupported(ok)
    if (!ok) return
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setOn(Boolean(sub)))
      .catch(() => {})
  }, [])

  async function enable() {
    setBusy(true)
    try {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') {
        toast.error('Notifications were blocked. Allow them in your browser settings.')
        return
      }
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!key) {
        toast.error('Notifications are not configured yet.')
        return
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      })
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      })
      if (!res.ok) throw new Error('save failed')
      setOn(true)
      toast.success('Notifications on. This device will get new order alerts.')
    } catch {
      toast.error('Could not turn on notifications.')
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      setOn(false)
      toast.success('Notifications off on this device.')
    } catch {
      toast.error('Could not turn off notifications.')
    } finally {
      setBusy(false)
    }
  }

  if (!supported) return null

  return (
    <button
      type="button"
      onClick={on ? disable : enable}
      disabled={busy}
      className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
    >
      <span className={`h-2 w-2 rounded-full ${on ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
      {busy ? 'One sec…' : on ? 'Alerts on' : 'Enable alerts'}
    </button>
  )
}
