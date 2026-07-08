import { relations } from 'drizzle-orm'
import {
  pgEnum,
  pgTable,
  text,
  integer,
  boolean,
  numeric,
  timestamp,
  uuid,
  unique,
} from 'drizzle-orm/pg-core'

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const leadStatus = pgEnum('lead_status', [
  'new_lead',
  'qualified',
  'payment_pending',
  'won',
  'lost',
])

export const leadSource = pgEnum('lead_source', [
  'discord',
  'tiktok',
  'referral',
  'affiliate',
  'repeat',
  'other',
])

export const orderStatus = pgEnum('order_status', [
  'paid',
  'awaiting_delivery',
  'delivered',
  'closed',
  'refunded',
  'chargeback',
])

export const paymentStatus = pgEnum('payment_status', [
  'pending',
  'paid',
  'failed',
  'refunded',
  'chargeback',
])

export const paymentMethod = pgEnum('payment_method', [
  'paypal',
  'crypto',
  'zelle',
  'cashapp',
  'card',
  'other',
])

export const deliveryStatus = pgEnum('delivery_status', [
  'not_started',
  'in_progress',
  'delivered',
])

export const issueType = pgEnum('issue_type', [
  'login_issue',
  'account_banned',
  'not_as_described',
  'access_lost',
  'payout_hold',
  'other',
])

export const replacementStatus = pgEnum('replacement_status', [
  'none',
  'requested',
  'in_progress',
  'replaced',
  'refunded',
  'resolved',
])

export const taskType = pgEnum('task_type', [
  'follow_up',
  'delivery',
  'upload_proof',
  'buyer_confirmation',
  'warranty_expiry',
])

export const taskStatus = pgEnum('task_status', ['open', 'done', 'snoozed'])

export const riskStatus = pgEnum('risk_status', ['good', 'watch', 'high_risk', 'blocked'])

// ---------------------------------------------------------------------------
// Shared column helpers
// ---------------------------------------------------------------------------

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date())

// ---------------------------------------------------------------------------
// reps — synced from Clerk. No custom auth table; `id` IS the Clerk user id.
// ---------------------------------------------------------------------------

export const reps = pgTable('reps', {
  id: text('id').primaryKey(), // clerk user id
  displayName: text('display_name'),
  email: text('email'),
  // 'admin' | 'rep'. admin sees payouts + profit, rep does not.
  role: text('role').notNull().default('rep'),
  createdAt: createdAt(),
})

// ---------------------------------------------------------------------------
// affiliates — declared before orders (orders references it).
// ---------------------------------------------------------------------------

export const affiliates = pgTable('affiliates', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  discordUsername: text('discord_username'),
  // TODO(sharjeel): confirm rate. numeric returns as a string; see lib/money.ts.
  commissionRate: numeric('commission_rate', { precision: 5, scale: 4 }).notNull().default('0.10'),
  referralsCount: integer('referrals_count').notNull().default(0),
  closedSalesCount: integer('closed_sales_count').notNull().default(0),
  revenueCents: integer('revenue_cents').notNull().default(0),
  commissionOwedCents: integer('commission_owed_cents').notNull().default(0),
  commissionPaidCents: integer('commission_paid_cents').notNull().default(0),
  notes: text('notes'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

// ---------------------------------------------------------------------------
// customers — one row per buyer, keyed by discord username. Rollups persisted.
// ---------------------------------------------------------------------------

export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    discordUsername: text('discord_username').notNull(),
    displayName: text('display_name'),
    totalOrders: integer('total_orders').notNull().default(0),
    totalSpentCents: integer('total_spent_cents').notNull().default(0),
    lastPurchaseAt: timestamp('last_purchase_at', { withTimezone: true }),
    riskStatus: riskStatus('risk_status').notNull().default('good'),
    notes: text('notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique('customers_discord_username_unique').on(t.discordUsername)]
)

// ---------------------------------------------------------------------------
// leads — pre-payment pipeline.
// ---------------------------------------------------------------------------

export const leads = pgTable('leads', {
  id: uuid('id').primaryKey().defaultRandom(),
  discordUsername: text('discord_username').notNull(),
  ticketLink: text('ticket_link'),
  discordChannelId: text('discord_channel_id'), // filled by bot in phase 2
  source: leadSource('source').notNull().default('discord'),
  interest: text('interest'),
  budgetCents: integer('budget_cents'),
  status: leadStatus('status').notNull().default('new_lead'),
  assignedRepId: text('assigned_rep_id').references(() => reps.id),
  lastContactAt: timestamp('last_contact_at', { withTimezone: true }),
  nextFollowUpAt: timestamp('next_follow_up_at', { withTimezone: true }),
  notes: text('notes'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

// ---------------------------------------------------------------------------
// orders — post-payment fulfillment. Money computed on write (lib/money.ts).
// ---------------------------------------------------------------------------

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  leadId: uuid('lead_id').references(() => leads.id), // origin lead, nullable
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id),
  affiliateId: uuid('affiliate_id').references(() => affiliates.id), // nullable
  package: text('package').notNull(),
  priceCents: integer('price_cents').notNull(),
  supplierPayoutCents: integer('supplier_payout_cents').notNull(),
  profitCents: integer('profit_cents').notNull(),
  commissionCents: integer('commission_cents').notNull().default(0),
  netProfitCents: integer('net_profit_cents'),
  paymentMethod: paymentMethod('payment_method'),
  paymentLink: text('payment_link'),
  paymentStatus: paymentStatus('payment_status').notNull().default('pending'),
  transactionId: text('transaction_id'),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  deliveryStatus: deliveryStatus('delivery_status').notNull().default('not_started'),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  deliveryProofUrl: text('delivery_proof_url'),
  buyerConfirmed: boolean('buyer_confirmed').notNull().default(false),
  buyerConfirmedAt: timestamp('buyer_confirmed_at', { withTimezone: true }),
  warrantyDays: integer('warranty_days').notNull().default(30),
  warrantyStart: timestamp('warranty_start', { withTimezone: true }),
  warrantyEnd: timestamp('warranty_end', { withTimezone: true }),
  status: orderStatus('status').notNull().default('paid'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

// ---------------------------------------------------------------------------
// issues — warranty / replacement tracking. One order → many issues.
// ---------------------------------------------------------------------------

export const issues = pgTable('issues', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id),
  issueType: issueType('issue_type'),
  openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
  warrantyValidAtOpen: boolean('warranty_valid_at_open'), // snapshot at open time
  replacementStatus: replacementStatus('replacement_status').notNull().default('none'),
  resolutionNotes: text('resolution_notes'),
  proofUrl: text('proof_url'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

// ---------------------------------------------------------------------------
// tasks — the rep action inbox; every automation reminder lands here.
// ---------------------------------------------------------------------------

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: taskType('type'),
  status: taskStatus('status').notNull().default('open'),
  title: text('title'),
  dueAt: timestamp('due_at', { withTimezone: true }),
  leadId: uuid('lead_id').references(() => leads.id),
  orderId: uuid('order_id').references(() => orders.id),
  assignedRepId: text('assigned_rep_id').references(() => reps.id),
  createdAt: createdAt(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
})

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const repsRelations = relations(reps, ({ many }) => ({
  leads: many(leads),
  tasks: many(tasks),
}))

export const leadsRelations = relations(leads, ({ one, many }) => ({
  assignedRep: one(reps, { fields: [leads.assignedRepId], references: [reps.id] }),
  orders: many(orders),
  tasks: many(tasks),
}))

export const customersRelations = relations(customers, ({ many }) => ({
  orders: many(orders),
}))

export const affiliatesRelations = relations(affiliates, ({ many }) => ({
  orders: many(orders),
}))

export const ordersRelations = relations(orders, ({ one, many }) => ({
  lead: one(leads, { fields: [orders.leadId], references: [leads.id] }),
  customer: one(customers, { fields: [orders.customerId], references: [customers.id] }),
  affiliate: one(affiliates, { fields: [orders.affiliateId], references: [affiliates.id] }),
  issues: many(issues),
  tasks: many(tasks),
}))

export const issuesRelations = relations(issues, ({ one }) => ({
  order: one(orders, { fields: [issues.orderId], references: [orders.id] }),
}))

export const tasksRelations = relations(tasks, ({ one }) => ({
  lead: one(leads, { fields: [tasks.leadId], references: [leads.id] }),
  order: one(orders, { fields: [tasks.orderId], references: [orders.id] }),
  assignedRep: one(reps, { fields: [tasks.assignedRepId], references: [reps.id] }),
}))

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type Rep = typeof reps.$inferSelect
export type Lead = typeof leads.$inferSelect
export type NewLead = typeof leads.$inferInsert
export type Customer = typeof customers.$inferSelect
export type Order = typeof orders.$inferSelect
export type NewOrder = typeof orders.$inferInsert
export type Issue = typeof issues.$inferSelect
export type Affiliate = typeof affiliates.$inferSelect
export type Task = typeof tasks.$inferSelect
export type NewTask = typeof tasks.$inferInsert
