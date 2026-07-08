'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { tasks } from '../db/schema'
import { requireRep } from '../auth'

const DAY = 86_400_000

function revalidateTasks() {
  revalidatePath('/tasks')
  revalidatePath('/')
}

export async function completeTask(id: string): Promise<void> {
  await requireRep()
  await db
    .update(tasks)
    .set({ status: 'done', completedAt: new Date() })
    .where(eq(tasks.id, id))
  revalidateTasks()
}

export async function reopenTask(id: string): Promise<void> {
  await requireRep()
  await db.update(tasks).set({ status: 'open', completedAt: null }).where(eq(tasks.id, id))
  revalidateTasks()
}

/** Snooze an open task by N days (default 1), pushing its due date out. */
export async function snoozeTask(id: string, days = 1): Promise<void> {
  await requireRep()
  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, id) })
  if (!task) return
  const base = task.dueAt && new Date(task.dueAt) > new Date() ? new Date(task.dueAt) : new Date()
  await db
    .update(tasks)
    .set({ status: 'snoozed', dueAt: new Date(base.getTime() + days * DAY) })
    .where(eq(tasks.id, id))
  revalidateTasks()
}
