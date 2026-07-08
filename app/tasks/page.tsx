import Link from 'next/link'
import { and, asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { tasks, taskStatus as taskStatusEnum, taskType as taskTypeEnum } from '@/lib/db/schema'
import { titleCase } from '@/lib/labels'
import { cn } from '@/lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { TaskRowActions } from '@/components/tasks/task-row-actions'
import { TasksFilters } from '@/components/tasks/tasks-filters'

function dueLabel(dueAt: Date | string | null, open: boolean) {
  if (!dueAt) return { text: '—', overdue: false }
  const d = new Date(dueAt)
  const overdue = open && d.getTime() < Date.now()
  return { text: d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }), overdue }
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string }>
}) {
  const { status, type } = await searchParams

  const conditions = []
  if (status && taskStatusEnum.enumValues.includes(status as never))
    conditions.push(eq(tasks.status, status as (typeof taskStatusEnum.enumValues)[number]))
  if (type && taskTypeEnum.enumValues.includes(type as never))
    conditions.push(eq(tasks.type, type as (typeof taskTypeEnum.enumValues)[number]))

  const rows = await db.query.tasks.findMany({
    where: conditions.length ? and(...conditions) : undefined,
    orderBy: [asc(tasks.dueAt)],
    with: { lead: true, order: true, assignedRep: true },
  })

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
        <p className="text-sm text-muted-foreground">{rows.length} shown</p>
      </div>

      <TasksFilters status={status ?? 'all'} type={type ?? 'all'} />

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Task</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Linked</TableHead>
              <TableHead>Assigned</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No tasks match these filters.
                </TableCell>
              </TableRow>
            )}
            {rows.map((t) => {
              const due = dueLabel(t.dueAt, t.status === 'open')
              return (
                <TableRow key={t.id} className={cn(t.status === 'done' && 'opacity-60')}>
                  <TableCell className="font-medium">{t.title}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {t.type ? titleCase(t.type) : '—'}
                  </TableCell>
                  <TableCell className={cn('text-sm', due.overdue && 'text-rose-600 dark:text-rose-400 font-medium')}>
                    {due.text}
                    {due.overdue && ' · overdue'}
                    {t.status === 'snoozed' && ' · snoozed'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {t.order ? (
                      <Link href={`/orders/${t.orderId}`} className="hover:underline">
                        {t.order.package}
                      </Link>
                    ) : t.lead ? (
                      <Link href={`/leads/${t.leadId}`} className="hover:underline">
                        {t.lead.discordUsername}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {t.assignedRep?.displayName ?? t.assignedRep?.email ?? 'Unassigned'}
                  </TableCell>
                  <TableCell>
                    <TaskRowActions taskId={t.id} status={t.status} />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
