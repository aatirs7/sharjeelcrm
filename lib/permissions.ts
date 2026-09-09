// Role hierarchy + capability matrix (spec §2/§40).
//  owner   — full access (the master PIN account).
//  admin   — everything except managing workers + settings (owner-only).
//  manager — deals + products + leaderboard (money hidden).
//  worker  — deals only.
//  coach   — their own scoped dashboard (handled separately).

export type Role = 'owner' | 'admin' | 'manager' | 'worker' | 'coach'

export type Capability =
  | 'deals'
  | 'financials'
  | 'coaches'
  | 'payouts'
  | 'workers'
  | 'settings'
  | 'products'
  | 'audit'
  | 'fraud'
  | 'leaderboard'

const MATRIX: Record<Role, Capability[]> = {
  owner: ['deals', 'financials', 'coaches', 'payouts', 'workers', 'settings', 'products', 'audit', 'fraud', 'leaderboard'],
  admin: ['deals', 'financials', 'coaches', 'payouts', 'products', 'audit', 'fraud', 'leaderboard'],
  manager: ['deals', 'products', 'leaderboard'],
  worker: ['deals'],
  coach: [],
}

export const STAFF_ROLES: Role[] = ['owner', 'admin', 'manager', 'worker']
export const isStaffRole = (r: Role | undefined | null): boolean => !!r && STAFF_ROLES.includes(r)

export function can(role: Role | undefined | null, cap: Capability): boolean {
  return !!role && (MATRIX[role]?.includes(cap) ?? false)
}

/** Where each role lands after login / when blocked from a page. */
export function landingFor(role: Role): string {
  if (role === 'coach') return '/coach'
  if (role === 'owner' || role === 'admin') return '/'
  return '/tickets' // manager, worker
}

/** The capability a path requires (for the proxy gate). */
export function capabilityForPath(pathname: string): Capability {
  const map: [string, Capability][] = [
    ['/revenue', 'financials'],
    ['/coaches', 'coaches'],
    ['/payouts', 'payouts'],
    ['/workers', 'workers'],
    ['/settings', 'settings'],
    ['/products', 'products'],
    ['/inventory', 'products'],
    ['/audit', 'audit'],
    ['/fraud', 'fraud'],
    ['/content', 'coaches'],
    ['/leaderboard', 'leaderboard'],
    ['/tickets', 'deals'],
    ['/orders', 'deals'],
    ['/customers', 'deals'],
    ['/issues', 'deals'],
    ['/tasks', 'deals'],
    ['/search', 'deals'],
    ['/me', 'deals'],
  ]
  for (const [prefix, cap] of map) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) return cap
  }
  // The dashboard (and anything else) shows financials -> owner/admin only.
  return 'financials'
}
