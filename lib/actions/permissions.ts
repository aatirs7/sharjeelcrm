'use server'

import { revalidatePath } from 'next/cache'
import { requireOwner } from '../auth'
import { setSetting, getSetting } from '../settings'
import { logAudit } from '../audit'
import type { Capability } from '../permissions'

/** Owner toggles whether a role has a capability (revoke = remove it). */
export async function toggleRoleCapability(
  role: 'admin' | 'manager',
  cap: Capability,
  enabled: boolean
): Promise<void> {
  await requireOwner()
  const current = await getSetting('roleOverrides')
  const revoked = new Set(current[role] ?? [])
  if (enabled) revoked.delete(cap)
  else revoked.add(cap)
  await setSetting('roleOverrides', { ...current, [role]: [...revoked] })
  await logAudit({
    action: 'settings.permissions',
    entity: 'settings',
    summary: `${enabled ? 'Granted' : 'Revoked'} ${cap} for ${role}`,
  })
  revalidatePath('/permissions')
}
