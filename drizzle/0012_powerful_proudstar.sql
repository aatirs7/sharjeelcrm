CREATE TABLE "fraud_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"coach_id" uuid,
	"customer_id" uuid,
	"detail" text NOT NULL,
	"ref_key" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fraud_flags_ref_key_unique" UNIQUE("ref_key")
);
--> statement-breakpoint
CREATE TABLE "payout_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coach_id" uuid NOT NULL,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"note" text,
	"payout_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "coaches" ADD COLUMN "discord_user_id" text;--> statement-breakpoint
ALTER TABLE "coaches" ADD COLUMN "referral_clicks" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "fraud_flags" ADD CONSTRAINT "fraud_flags_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fraud_flags" ADD CONSTRAINT "fraud_flags_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_payout_id_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."payouts"("id") ON DELETE no action ON UPDATE no action;