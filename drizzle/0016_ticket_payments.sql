ALTER TABLE "leads" ADD COLUMN "payment_method" "payment_method";--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "payment_link" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "payment_ref" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "stripe_session_id" text;