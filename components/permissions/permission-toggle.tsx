'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { toggleRoleCapability } from '@/lib/actions/permissions'
import type { Capability } from '@/lib/permissions'

export function PermissionToggle({
  role,
  cap,
  enabled,
  locked,
}: {
  role: 'admin' | 'manager'
  cap: Capability
  enabled: boolean
  locked: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  if (locked) {
    return <span className="text-xs text-muted-foreground">—</span>
  }
  return (
    <input
      type="checkbox"
      checked={enabled}
      disabled={pending}
      className="size-4 accent-[var(--primary)] disabled:opacity-50"
      onChange={(e) => {
        const next = e.target.checked
        startTransition(async () => {
          try {
            await toggleRoleCapability(role, cap, next)
            router.refresh()
          } catch {
            toast.error('Could not update')
          }
        })
      }}
    />
  )
}
