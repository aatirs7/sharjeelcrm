CREATE TABLE "crypto_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chain" text NOT NULL,
	"tx_hash" text NOT NULL,
	"asset" text NOT NULL,
	"amount_units" text NOT NULL,
	"block_time" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"quote_id" uuid,
	"lead_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crypto_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"asset" text NOT NULL,
	"amount_units" text NOT NULL,
	"usd_cents" integer NOT NULL,
	"tag_cents" integer NOT NULL,
	"rate_usd" text,
	"status" text DEFAULT 'open' NOT NULL,
	"expires_at" timestamp with time zone,
	"paid_tx" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crypto_scan_state" (
	"chain" text PRIMARY KEY NOT NULL,
	"since" timestamp with time zone NOT NULL,
	"cursor" text,
	"last_ok_at" timestamp with time zone,
	"last_error" text,
	"alerted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "crypto_payments" ADD CONSTRAINT "crypto_payments_quote_id_crypto_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."crypto_quotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crypto_payments" ADD CONSTRAINT "crypto_payments_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crypto_quotes" ADD CONSTRAINT "crypto_quotes_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "crypto_payments_tx" ON "crypto_payments" USING btree ("chain","tx_hash","asset");--> statement-breakpoint
CREATE UNIQUE INDEX "crypto_quotes_open_amount" ON "crypto_quotes" USING btree ("asset","amount_units") WHERE status = 'open';