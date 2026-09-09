import { desc, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { reps, leads } from '@/lib/db/schema'
import { formatCents } from '@/lib/money'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PageHeader } from '@/components/page-header'
import { AddWorkerDialog, WorkerRowActions } from '@/components/workers/worker-manager'

export const dynamic = 'force-dynamic'

export default async function WorkersPage() {
  const [workers, allLeads] = await Promise.all([
    db.select().from(reps).orderBy(desc(reps.createdAt)),
    db.select().from(leads),
  ])

  // Simple per-worker performance (spec §35): claimed deals + completed.
  const claimed = new Map<string, number>()
  const completed = new Map<string, number>()
  for (const l of allLeads) {
    if (!l.assignedRepId) continue
    claimed.set(l.assignedRepId, (claimed.get(l.assignedRepId) ?? 0) + 1)
    if (l.status === 'completed')
      completed.set(l.assignedRepId, (completed.get(l.assignedRepId) ?? 0) + 1)
  }

  return (
    <div className="space-y-5">
      <PageHeader
        marker="workers"
        title="Workers"
        meta={`${workers.length} accounts`}
        action={<AddWorkerDialog />}
      />

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Claimed</TableHead>
              <TableHead className="text-right">Completed</TableHead>
              <TableHead className="text-right">Manage</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {workers.map((w) => (
              <TableRow key={w.id}>
                <TableCell className="font-medium">
                  {w.displayName ?? w.id}
                  {w.email && <div className="text-xs text-muted-foreground">{w.email}</div>}
                </TableCell>
                <TableCell className="text-sm">{w.role}</TableCell>
                <TableCell className="text-sm">
                  <span className={w.active ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}>
                    {w.active ? 'active' : 'disabled'}
                  </span>
                  {w.loginCodeHash ? ' · code set' : ''}
                </TableCell>
                <TableCell className="text-right tabular-nums">{claimed.get(w.id) ?? 0}</TableCell>
                <TableCell className="text-right tabular-nums font-medium">{completed.get(w.id) ?? 0}</TableCell>
                <TableCell>
                  <WorkerRowActions
                    id={w.id}
                    active={w.active}
                    role={w.role}
                    isLocalAdmin={w.id === 'local_admin'}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
