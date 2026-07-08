import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'

// ---------------------------------------------------------------------------
// M1: reps only. The full data model (leads, customers, orders, issues,
// affiliates, tasks + all enums) is added in M2.
// ---------------------------------------------------------------------------

// Synced from Clerk. No custom auth table — `id` IS the Clerk user id.
export const reps = pgTable('reps', {
  id: text('id').primaryKey(), // clerk user id
  displayName: text('display_name'),
  email: text('email'),
  // 'admin' | 'rep'. admin sees payouts + profit, rep does not.
  role: text('role').notNull().default('rep'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type Rep = typeof reps.$inferSelect
