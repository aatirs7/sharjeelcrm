import Link from 'next/link'
import { and, asc, eq, isNull, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { tasks } from '@/lib/db/schema'
import { titleCase } from '@/lib/labels'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TaskRowActions } from '@/components/tasks/task-row-actions'

// Module-scope so the render body stays pure (react-hooks/purity).
function formatDue(dueAt: Date | string | null) {
  if (!dueAt) return { text: 'No due date', overdue: false }
  const d = new Date(dueAt)
  const overdue = d.getTime() < Date.now()
  const text = `Due ${d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}${overdue ? ' · overdue' : ''}`
  return { text, overdue }
}

/** Open tasks assigned to this rep (or unassigned), soonest due first. */
export async function TaskInbox({ repId }: { repId: string }) {
  const rows = await db.query.tasks.findMany({
    where: and(
      eq(tasks.status, 'open'),
      or(eq(tasks.assignedRepId, repId), isNull(tasks.assignedRepId))
    ),
    orderBy: [asc(tasks.dueAt)],
    with: { lead: true, order: true },
  })

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Task inbox</CardTitle>
        <Link href="/tasks" className="text-sm text-muted-foreground hover:underline">
          View all →
        </Link>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing open. Nice.</p>
        ) : (
          <ul className="divide-y">
            {rows.map((t) => {
              const { text: dueText, overdue } = formatDue(t.dueAt)
              const href = t.orderId ? `/orders/${t.orderId}` : t.leadId ? `/tickets/${t.leadId}` : null
              return (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {href ? (
                        <Link href={href} className="font-medium truncate hover:underline">
                          {t.title}
                        </Link>
                      ) : (
                        <span className="font-medium truncate">{t.title}</span>
                      )}
                      <span className="text-xs text-muted-foreground shrink-0">
                        {t.type ? titleCase(t.type) : ''}
                      </span>
                    </div>
                    <div
                      className={cn(
                        'text-xs',
                        overdue ? 'text-rose-600 dark:text-rose-400 font-medium' : 'text-muted-foreground'
                      )}
                    >
                      {dueText}
                    </div>
                  </div>
                  <TaskRowActions taskId={t.id} status={t.status} />
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
