ALTER TYPE "public"."commission_status" ADD VALUE 'reversed';--> statement-breakpoint
ALTER TABLE "commissions" ADD COLUMN "needs_review" boolean DEFAULT false NOT NULL;