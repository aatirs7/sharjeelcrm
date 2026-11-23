CREATE TABLE "ticket_idle_notices" (
	"channel_id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"message_id" text,
	"noted_at" timestamp with time zone DEFAULT now() NOT NULL
);
