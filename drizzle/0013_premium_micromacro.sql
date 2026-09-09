CREATE TABLE "coach_achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coach_id" uuid NOT NULL,
	"key" text NOT NULL,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coach_achievements_coach_key_unique" UNIQUE("coach_id","key")
);
--> statement-breakpoint
ALTER TABLE "coach_achievements" ADD CONSTRAINT "coach_achievements_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;