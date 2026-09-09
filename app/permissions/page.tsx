import { getRoleOverrides } from '@/lib/settings'
import { ALL_CAPABILITIES, can, effectiveCan, OVERRIDABLE_ROLES } from '@/lib/permissions'
import { titleCase } from '@/lib/labels'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PageHeader } from '@/components/page-header'
import { PermissionToggle } from '@/components/permissions/permission-toggle'

export const dynamic = 'force-dynamic'

export default async function PermissionsPage() {
  const overrides = await getRoleOverrides()

  return (
    <div className="space-y-5">
      <PageHeader marker="permissions" title="Permissions" meta="what each role can access" />
      <p className="text-sm text-muted-foreground">
        Owner always has everything. Toggle capabilities for Admin and Manager. A dash means the role
        never had that capability. Workers handle deals only; coaches are scoped to their own view.
      </p>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Capability</TableHead>
              {OVERRIDABLE_ROLES.map((r) => (
                <TableHead key={r} className="text-center capitalize">
                  {r}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {ALL_CAPABILITIES.map((cap) => (
              <TableRow key={cap}>
                <TableCell className="font-medium capitalize">{titleCase(cap)}</TableCell>
                {OVERRIDABLE_ROLES.map((r) => {
                  const base = can(r, cap) // capability exists in the role's baseline
                  const on = effectiveCan(r, cap, overrides)
                  return (
                    <TableCell key={r} className="text-center">
                      <PermissionToggle role={r} cap={cap} enabled={on} locked={!base} />
                    </TableCell>
                  )
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
