CREATE TABLE "blitz_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"note" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_transcripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" text NOT NULL,
	"channel_name" text NOT NULL,
	"lead_id" uuid,
	"buyer_discord_id" text,
	"messages" jsonb NOT NULL,
	"message_count" integer NOT NULL,
	"closed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_transcripts_channel_id_unique" UNIQUE("channel_id")
);
--> statement-breakpoint
ALTER TABLE "ticket_transcripts" ADD CONSTRAINT "ticket_transcripts_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;