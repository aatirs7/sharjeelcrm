import { desc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { reps, leads, orders } from '@/lib/db/schema'
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
  const [workers, allLeads, allOrders] = await Promise.all([
    db.select().from(reps).orderBy(desc(reps.createdAt)),
    db.select().from(leads),
    db.select().from(orders),
  ])

  // Per-worker performance (spec §35): claimed, completed, conversion, revenue,
  // and average first-response time.
  const claimed = new Map<string, number>()
  const completed = new Map<string, number>()
  const cancelled = new Map<string, number>()
  const respMs = new Map<string, number[]>()
  const leadRepById = new Map<string, string | null>()
  for (const l of allLeads) {
    leadRepById.set(l.id, l.assignedRepId ?? null)
    if (!l.assignedRepId) continue
    claimed.set(l.assignedRepId, (claimed.get(l.assignedRepId) ?? 0) + 1)
    if (l.status === 'completed') completed.set(l.assignedRepId, (completed.get(l.assignedRepId) ?? 0) + 1)
    if (l.status === 'cancelled') cancelled.set(l.assignedRepId, (cancelled.get(l.assignedRepId) ?? 0) + 1)
    if (l.firstResponseAt) {
      const ms = new Date(l.firstResponseAt).getTime() - new Date(l.createdAt).getTime()
      if (ms >= 0) respMs.set(l.assignedRepId, [...(respMs.get(l.assignedRepId) ?? []), ms])
    }
  }
  const revenue = new Map<string, number>()
  for (const o of allOrders) {
    if (o.paymentStatus !== 'paid' || !o.leadId) continue
    const rid = leadRepById.get(o.leadId)
    if (rid) revenue.set(rid, (revenue.get(rid) ?? 0) + o.priceCents)
  }
  const convPct = (id: string) => {
    const w = completed.get(id) ?? 0
    const decided = w + (cancelled.get(id) ?? 0)
    return decided ? Math.round((w / decided) * 100) : null
  }
  const avgResp = (id: string) => {
    const arr = respMs.get(id)
    if (!arr || arr.length === 0) return null
    return Math.round(arr.reduce((s, m) => s + m, 0) / arr.length / 60000) // minutes
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
              <TableHead className="text-right">Conv.</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
              <TableHead className="text-right">Avg response</TableHead>
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
                <TableCell className="text-right tabular-nums">{convPct(w.id) == null ? '—' : `${convPct(w.id)}%`}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCents(revenue.get(w.id) ?? 0)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {avgResp(w.id) == null ? '—' : `${avgResp(w.id)}m`}
                </TableCell>
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
