CREATE TYPE "public"."delivery_status" AS ENUM('not_started', 'in_progress', 'delivered');--> statement-breakpoint
CREATE TYPE "public"."issue_type" AS ENUM('login_issue', 'account_banned', 'not_as_described', 'access_lost', 'payout_hold', 'other');--> statement-breakpoint
CREATE TYPE "public"."lead_source" AS ENUM('discord', 'tiktok', 'referral', 'affiliate', 'repeat', 'other');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('new_lead', 'qualified', 'payment_pending', 'won', 'lost');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('paid', 'awaiting_delivery', 'delivered', 'closed', 'refunded', 'chargeback');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('paypal', 'crypto', 'zelle', 'cashapp', 'card', 'other');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'paid', 'failed', 'refunded', 'chargeback');--> statement-breakpoint
CREATE TYPE "public"."replacement_status" AS ENUM('none', 'requested', 'in_progress', 'replaced', 'refunded', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."risk_status" AS ENUM('good', 'watch', 'high_risk', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('open', 'done', 'snoozed');--> statement-breakpoint
CREATE TYPE "public"."task_type" AS ENUM('follow_up', 'delivery', 'upload_proof', 'buyer_confirmation', 'warranty_expiry');--> statement-breakpoint
CREATE TABLE "affiliates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"discord_username" text,
	"commission_rate" numeric(5, 4) DEFAULT '0.10' NOT NULL,
	"referrals_count" integer DEFAULT 0 NOT NULL,
	"closed_sales_count" integer DEFAULT 0 NOT NULL,
	"revenue_cents" integer DEFAULT 0 NOT NULL,
	"commission_owed_cents" integer DEFAULT 0 NOT NULL,
	"commission_paid_cents" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discord_username" text NOT NULL,
	"display_name" text,
	"total_orders" integer DEFAULT 0 NOT NULL,
	"total_spent_cents" integer DEFAULT 0 NOT NULL,
	"last_purchase_at" timestamp with time zone,
	"risk_status" "risk_status" DEFAULT 'good' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_discord_username_unique" UNIQUE("discord_username")
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"issue_type" "issue_type",
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"warranty_valid_at_open" boolean,
	"replacement_status" "replacement_status" DEFAULT 'none' NOT NULL,
	"resolution_notes" text,
	"proof_url" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discord_username" text NOT NULL,
	"ticket_link" text,
	"discord_channel_id" text,
	"source" "lead_source" DEFAULT 'discord' NOT NULL,
	"interest" text,
	"budget_cents" integer,
	"status" "lead_status" DEFAULT 'new_lead' NOT NULL,
	"assigned_rep_id" text,
	"last_contact_at" timestamp with time zone,
	"next_follow_up_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid,
	"customer_id" uuid NOT NULL,
	"affiliate_id" uuid,
	"package" text NOT NULL,
	"price_cents" integer NOT NULL,
	"supplier_payout_cents" integer NOT NULL,
	"profit_cents" integer NOT NULL,
	"commission_cents" integer DEFAULT 0 NOT NULL,
	"net_profit_cents" integer,
	"payment_method" "payment_method",
	"payment_link" text,
	"payment_status" "payment_status" DEFAULT 'pending' NOT NULL,
	"transaction_id" text,
	"paid_at" timestamp with time zone,
	"delivery_status" "delivery_status" DEFAULT 'not_started' NOT NULL,
	"delivered_at" timestamp with time zone,
	"delivery_proof_url" text,
	"buyer_confirmed" boolean DEFAULT false NOT NULL,
	"buyer_confirmed_at" timestamp with time zone,
	"warranty_days" integer DEFAULT 30 NOT NULL,
	"warranty_start" timestamp with time zone,
	"warranty_end" timestamp with time zone,
	"status" "order_status" DEFAULT 'paid' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reps" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text,
	"email" text,
	"role" text DEFAULT 'rep' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "task_type",
	"status" "task_status" DEFAULT 'open' NOT NULL,
	"title" text,
	"due_at" timestamp with time zone,
	"lead_id" uuid,
	"order_id" uuid,
	"assigned_rep_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_rep_id_reps_id_fk" FOREIGN KEY ("assigned_rep_id") REFERENCES "public"."reps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_affiliate_id_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_rep_id_reps_id_fk" FOREIGN KEY ("assigned_rep_id") REFERENCES "public"."reps"("id") ON DELETE no action ON UPDATE no action;