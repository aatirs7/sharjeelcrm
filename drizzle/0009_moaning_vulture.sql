ALTER TABLE "reps" ALTER COLUMN "role" SET DEFAULT 'worker';--> statement-breakpoint
ALTER TABLE "reps" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "reps" ADD COLUMN "discord_user_id" text;--> statement-breakpoint
ALTER TABLE "reps" ADD COLUMN "login_code_hash" text;