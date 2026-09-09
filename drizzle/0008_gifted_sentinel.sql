-- Phase 1a: 10-stage deal pipeline, DEAL-#### numbers, lost reasons, audit log.
-- Hand-adjusted from the generated SQL to (a) create the deal_number sequence
-- before the column references it, and (b) remap old lead_status values in place.

CREATE TYPE "public"."lost_reason" AS ENUM('no_response', 'too_expensive', 'changed_mind', 'payment_problem', 'product_unavailable', 'bought_elsewhere', 'other');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text,
	"actor_role" text,
	"action" text NOT NULL,
	"entity" text,
	"entity_ref" text,
	"summary" text NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS "deal_number_seq" START WITH 10001;--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "status" SET DEFAULT 'new_lead'::text;--> statement-breakpoint
DROP TYPE "public"."lead_status";--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('new_lead', 'contacted', 'product_selected', 'waiting_payment', 'payment_received', 'fulfillment', 'completed', 'cancelled', 'refunded', 'disputed');--> statement-breakpoint
UPDATE "leads" SET "status" = CASE "status"
  WHEN 'ticket_opened' THEN 'contacted'
  WHEN 'interested' THEN 'product_selected'
  WHEN 'invoice_sent' THEN 'waiting_payment'
  WHEN 'paid' THEN 'completed'
  WHEN 'lost' THEN 'cancelled'
  ELSE "status" END;--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "status" SET DEFAULT 'new_lead'::"public"."lead_status";--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "status" SET DATA TYPE "public"."lead_status" USING "status"::"public"."lead_status";--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "deal_number" integer DEFAULT nextval('deal_number_seq'::regclass) NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "lost_reason" "lost_reason";--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_deal_number_unique" UNIQUE("deal_number");
