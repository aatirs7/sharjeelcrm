-- v2 affiliate/coach platform. Hand-authored to preserve live data: the old
-- `affiliates` table is RENAMED to `coaches` (not dropped/recreated), and the
-- lead_status enum values are remapped in place. drizzle-kit cannot infer a
-- table rename non-interactively, so this migration is written by hand; the
-- 0005 snapshot reflects the same end state so future generates stay clean.

-- New enums ------------------------------------------------------------------
CREATE TYPE "public"."coach_tier" AS ENUM('bronze', 'silver', 'gold');--> statement-breakpoint
CREATE TYPE "public"."coach_status" AS ENUM('active', 'paused', 'banned');--> statement-breakpoint
CREATE TYPE "public"."commission_status" AS ENUM('not_eligible', 'pending', 'approved', 'paid', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('pending', 'paid');--> statement-breakpoint

-- affiliates -> coaches (rename, preserve rows) ------------------------------
ALTER TABLE "affiliates" RENAME TO "coaches";--> statement-breakpoint
ALTER TABLE "coaches" RENAME COLUMN "referral_code" TO "promo_code";--> statement-breakpoint
ALTER TABLE "coaches" RENAME CONSTRAINT "affiliates_referral_code_unique" TO "coaches_promo_code_unique";--> statement-breakpoint
ALTER TABLE "coaches" ADD COLUMN "coach_code" text;--> statement-breakpoint
ALTER TABLE "coaches" ADD COLUMN "tracking_link" text;--> statement-breakpoint
ALTER TABLE "coaches" ADD COLUMN "discord_invite_link" text;--> statement-breakpoint
ALTER TABLE "coaches" ADD COLUMN "lead_role" text;--> statement-breakpoint
ALTER TABLE "coaches" ADD COLUMN "partner_role" text;--> statement-breakpoint
ALTER TABLE "coaches" ADD COLUMN "tier" "coach_tier" DEFAULT 'bronze' NOT NULL;--> statement-breakpoint
ALTER TABLE "coaches" ADD COLUMN "payout_method" text;--> statement-breakpoint
ALTER TABLE "coaches" ADD COLUMN "status" "coach_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "coaches" ADD COLUMN "login_code_hash" text;--> statement-breakpoint
-- Backfill a handle from the existing name so coach_code is populated.
UPDATE "coaches" SET "coach_code" = regexp_replace(lower("name"), '[^a-z0-9]+', '-', 'g') WHERE "coach_code" IS NULL;--> statement-breakpoint
ALTER TABLE "coaches" ADD CONSTRAINT "coaches_coach_code_unique" UNIQUE("coach_code");--> statement-breakpoint

-- lead_status: expand + remap old values in place ---------------------------
ALTER TABLE "leads" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TYPE "public"."lead_status" RENAME TO "lead_status_old";--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('new_lead', 'contacted', 'ticket_opened', 'interested', 'invoice_sent', 'paid', 'lost');--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "status" TYPE "public"."lead_status" USING (
  CASE "status"::text
    WHEN 'qualified' THEN 'interested'
    WHEN 'payment_pending' THEN 'invoice_sent'
    WHEN 'won' THEN 'paid'
    ELSE "status"::text
  END::"public"."lead_status"
);--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "status" SET DEFAULT 'new_lead';--> statement-breakpoint
DROP TYPE "public"."lead_status_old";--> statement-breakpoint

-- leads: attribution columns ------------------------------------------------
ALTER TABLE "leads" ADD COLUMN "source_coach_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "promo_code_used" text;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_source_coach_id_coaches_id_fk" FOREIGN KEY ("source_coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- orders: affiliate_id -> source_coach_id (authoritative attribution) --------
ALTER TABLE "orders" RENAME COLUMN "affiliate_id" TO "source_coach_id";--> statement-breakpoint
ALTER TABLE "orders" RENAME CONSTRAINT "orders_affiliate_id_affiliates_id_fk" TO "orders_source_coach_id_coaches_id_fk";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "promo_code_used" text;--> statement-breakpoint

-- payouts --------------------------------------------------------------------
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coach_id" uuid NOT NULL,
	"period_start" date,
	"period_end" date,
	"buyer_count" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"status" "payout_status" DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp with time zone,
	"method" text,
	"transaction_ref" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- commissions ----------------------------------------------------------------
CREATE TABLE "commissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"coach_id" uuid NOT NULL,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"status" "commission_status" DEFAULT 'pending' NOT NULL,
	"eligible_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"tier_at_approval" "coach_tier",
	"payout_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commissions_order_id_unique" UNIQUE("order_id")
);--> statement-breakpoint
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_payout_id_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."payouts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- coach_content --------------------------------------------------------------
CREATE TABLE "coach_content" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coach_id" uuid NOT NULL,
	"video_link" text,
	"views" integer DEFAULT 0 NOT NULL,
	"comments" integer DEFAULT 0 NOT NULL,
	"dms" integer DEFAULT 0 NOT NULL,
	"leads_generated" integer DEFAULT 0 NOT NULL,
	"tickets_opened" integer DEFAULT 0 NOT NULL,
	"buyers" integer DEFAULT 0 NOT NULL,
	"revenue_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "coach_content" ADD CONSTRAINT "coach_content_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;
