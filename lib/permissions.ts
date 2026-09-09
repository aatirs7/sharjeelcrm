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

export const ALL_CAPABILITIES: Capability[] = [
  'deals', 'financials', 'coaches', 'payouts', 'workers', 'settings', 'products', 'audit', 'fraud', 'leaderboard',
]

export function can(role: Role | undefined | null, cap: Capability): boolean {
  return !!role && (MATRIX[role]?.includes(cap) ?? false)
}

/** Owner-configurable revokes: which base capabilities are taken from a role (§40). */
export type RoleOverrides = { admin?: Capability[]; manager?: Capability[] }

/** Base capabilities minus any owner revoke for that role. Owner is never revoked. */
export function effectiveCan(
  role: Role | undefined | null,
  cap: Capability,
  overrides: RoleOverrides | null | undefined
): boolean {
  if (!can(role, cap)) return false
  if (role === 'admin' || role === 'manager') {
    if (overrides?.[role]?.includes(cap)) return false
  }
  return true
}

/** The effective capability list for a role after revokes. */
export function effectiveCaps(role: Role, overrides: RoleOverrides | null | undefined): Capability[] {
  return (MATRIX[role] ?? []).filter((c) => effectiveCan(role, c, overrides))
}

/** Which roles are overridable (owner is not, worker/coach have minimal/none). */
export const OVERRIDABLE_ROLES: ('admin' | 'manager')[] = ['admin', 'manager']

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
    ['/analytics', 'financials'],
    ['/coaches', 'coaches'],
    ['/payouts', 'payouts'],
    ['/workers', 'workers'],
    ['/settings', 'settings'],
    ['/permissions', 'settings'],
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
