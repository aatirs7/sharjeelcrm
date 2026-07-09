ALTER TABLE "affiliates" ADD COLUMN "referral_code" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "referral_code" text;--> statement-breakpoint
ALTER TABLE "affiliates" ADD CONSTRAINT "affiliates_referral_code_unique" UNIQUE("referral_code");