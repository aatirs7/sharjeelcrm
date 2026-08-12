import { relations } from 'drizzle-orm'
import {
  pgEnum,
  pgTable,
  text,
  integer,
  boolean,
  numeric,
  timestamp,
  date,
  uuid,
  unique,
} from 'drizzle-orm/pg-core'

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const leadStatus = pgEnum('lead_status', [
  'new_lead',
  'contacted',
  'ticket_opened',
  'interested',
  'invoice_sent',
  'paid',
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

// What a ticket is about — set by the bot tag buttons / classifier.
export const ticketType = pgEnum('ticket_type', ['purchase', 'support', 'question', 'other'])

export const riskStatus = pgEnum('risk_status', ['good', 'watch', 'high_risk', 'blocked'])

// --- v2 coach/affiliate enums ---
export const coachTier = pgEnum('coach_tier', ['bronze', 'silver', 'gold'])
export const coachStatus = pgEnum('coach_status', ['active', 'paused', 'banned'])
// Commission state machine (7-day hold-and-approve).
export const commissionStatus = pgEnum('commission_status', [
  'not_eligible',
  'pending',
  'approved',
  'paid',
  'cancelled',
])
export const payoutStatus = pgEnum('payout_status', ['pending', 'paid'])

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
// reps — local admin/rep accounts. `id` is a stable string (Clerk removed).
// ---------------------------------------------------------------------------

export const reps = pgTable('reps', {
  id: text('id').primaryKey(),
  displayName: text('display_name'),
  email: text('email'),
  // 'admin' | 'rep'. admin sees payouts + profit, rep does not.
  role: text('role').notNull().default('rep'),
  createdAt: createdAt(),
})

// ---------------------------------------------------------------------------
// coaches — affiliate/coach partners (evolved from the old `affiliates` table).
// Declared before orders (orders references it). Rollup counters are persisted.
// ---------------------------------------------------------------------------

export const coaches = pgTable('coaches', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  discordUsername: text('discord_username'),
  // Handle used for role names + the coach dashboard (e.g. "ishhy-printss").
  coachCode: text('coach_code').unique(),
  // Promo / discount code buyers cite (e.g. "ISHHY100"). Unique so codes map 1:1.
  promoCode: text('promo_code').unique(),
  trackingLink: text('tracking_link'),
  discordInviteLink: text('discord_invite_link'),
  leadRole: text('lead_role'),
  partnerRole: text('partner_role'),
  // Percent-mode rate. numeric returns as a string; see lib/money.ts.
  // TODO(sharjeel): confirm rate + whether commission comes off gross or profit.
  commissionRate: numeric('commission_rate', { precision: 5, scale: 4 }).notNull().default('0.10'),
  tier: coachTier('tier').notNull().default('bronze'),
  payoutMethod: text('payout_method'),
  status: coachStatus('status').notNull().default('active'),
  // HMAC of the coach's login code, never the code itself. See lib/session.ts.
  loginCodeHash: text('login_code_hash'),
  // Persisted rollups (recomputed on order/commission mutations).
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
  discordUserId: text('discord_user_id'), // buyer's Discord user id (for role provisioning)
  ticketLink: text('ticket_link'),
  discordChannelId: text('discord_channel_id'), // filled by the poll cron
  routeCategory: text('route_category'), // SHOP|BUNDLE|COACH|PARTNER|SUPPORT keyword tag
  source: leadSource('source').notNull().default('discord'),
  ticketType: ticketType('ticket_type'), // purchase | support | question — for tabs
  email: text('email'), // buyer email — matches Stripe charge billing email
  referralCode: text('referral_code'), // raw code the buyer cited (attribution signal)
  // Resolved attribution (set at ingest when the code matches a coach's promo code).
  sourceCoachId: uuid('source_coach_id').references(() => coaches.id),
  promoCodeUsed: text('promo_code_used'), // the matched promo code, snapshot
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
  // Locked attribution — copied from the lead at paid time, authoritative for credit.
  sourceCoachId: uuid('source_coach_id').references(() => coaches.id), // nullable
  promoCodeUsed: text('promo_code_used'), // snapshot of the code that earned credit
  package: text('package').notNull(),
  priceCents: integer('price_cents').notNull(),
  supplierPayoutCents: integer('supplier_payout_cents').notNull(),
  serviceFeeCents: integer('service_fee_cents').notNull().default(0),
  profitCents: integer('profit_cents').notNull(),
  commissionCents: integer('commission_cents').notNull().default(0),
  netProfitCents: integer('net_profit_cents'),
  paymentMethod: paymentMethod('payment_method'),
  paymentLink: text('payment_link'),
  paymentStatus: paymentStatus('payment_status').notNull().default('pending'),
  transactionId: text('transaction_id'), // Stripe charge id when recorded
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
// payouts — a 7-day batch of a coach's approved commissions. Declared before
// commissions (commissions references payouts).
// ---------------------------------------------------------------------------

export const payouts = pgTable('payouts', {
  id: uuid('id').primaryKey().defaultRandom(),
  coachId: uuid('coach_id')
    .notNull()
    .references(() => coaches.id),
  periodStart: date('period_start'),
  periodEnd: date('period_end'),
  buyerCount: integer('buyer_count').notNull().default(0),
  totalCents: integer('total_cents').notNull().default(0),
  status: payoutStatus('status').notNull().default('pending'),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  method: text('method'),
  transactionRef: text('transaction_ref'), // id or proof url
  notes: text('notes'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

// ---------------------------------------------------------------------------
// commissions — one row per attributed sale. This is the state machine.
// ---------------------------------------------------------------------------

export const commissions = pgTable('commissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id')
    .notNull()
    .unique()
    .references(() => orders.id),
  coachId: uuid('coach_id')
    .notNull()
    .references(() => coaches.id),
  // Provisional at pending; frozen at approval.
  amountCents: integer('amount_cents').notNull().default(0),
  status: commissionStatus('status').notNull().default('pending'),
  eligibleAt: timestamp('eligible_at', { withTimezone: true }), // = order.paidAt + 7d
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  cancelReason: text('cancel_reason'), // 'refund' | 'chargeback'
  tierAtApproval: coachTier('tier_at_approval'), // snapshot
  payoutId: uuid('payout_id').references(() => payouts.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

// ---------------------------------------------------------------------------
// coach_content — per-coach content tracking (mostly manual entry).
// ---------------------------------------------------------------------------

export const coachContent = pgTable('coach_content', {
  id: uuid('id').primaryKey().defaultRandom(),
  coachId: uuid('coach_id')
    .notNull()
    .references(() => coaches.id),
  videoLink: text('video_link'),
  views: integer('views').notNull().default(0),
  comments: integer('comments').notNull().default(0),
  dms: integer('dms').notNull().default(0),
  leadsGenerated: integer('leads_generated').notNull().default(0),
  ticketsOpened: integer('tickets_opened').notNull().default(0),
  buyers: integer('buyers').notNull().default(0),
  revenueCents: integer('revenue_cents').notNull().default(0),
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
  sourceCoach: one(coaches, { fields: [leads.sourceCoachId], references: [coaches.id] }),
  orders: many(orders),
  tasks: many(tasks),
}))

export const customersRelations = relations(customers, ({ many }) => ({
  orders: many(orders),
}))

export const coachesRelations = relations(coaches, ({ many }) => ({
  orders: many(orders),
  commissions: many(commissions),
  payouts: many(payouts),
  content: many(coachContent),
}))

export const ordersRelations = relations(orders, ({ one, many }) => ({
  lead: one(leads, { fields: [orders.leadId], references: [leads.id] }),
  customer: one(customers, { fields: [orders.customerId], references: [customers.id] }),
  sourceCoach: one(coaches, { fields: [orders.sourceCoachId], references: [coaches.id] }),
  commission: one(commissions, { fields: [orders.id], references: [commissions.orderId] }),
  issues: many(issues),
  tasks: many(tasks),
}))

export const commissionsRelations = relations(commissions, ({ one }) => ({
  order: one(orders, { fields: [commissions.orderId], references: [orders.id] }),
  coach: one(coaches, { fields: [commissions.coachId], references: [coaches.id] }),
  payout: one(payouts, { fields: [commissions.payoutId], references: [payouts.id] }),
}))

export const payoutsRelations = relations(payouts, ({ one, many }) => ({
  coach: one(coaches, { fields: [payouts.coachId], references: [coaches.id] }),
  commissions: many(commissions),
}))

export const coachContentRelations = relations(coachContent, ({ one }) => ({
  coach: one(coaches, { fields: [coachContent.coachId], references: [coaches.id] }),
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
export type Coach = typeof coaches.$inferSelect
export type NewCoach = typeof coaches.$inferInsert
export type Commission = typeof commissions.$inferSelect
export type NewCommission = typeof commissions.$inferInsert
export type Payout = typeof payouts.$inferSelect
export type NewPayout = typeof payouts.$inferInsert
export type CoachContent = typeof coachContent.$inferSelect
export type Task = typeof tasks.$inferSelect
export type NewTask = typeof tasks.$inferInsert
