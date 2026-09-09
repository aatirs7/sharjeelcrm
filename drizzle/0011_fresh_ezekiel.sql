CREATE TYPE "public"."inventory_status" AS ENUM('available', 'reserved', 'sold', 'unavailable');--> statement-breakpoint
ALTER TYPE "public"."lead_source" ADD VALUE 'direct' BEFORE 'other';--> statement-breakpoint
ALTER TYPE "public"."lead_source" ADD VALUE 'telegram' BEFORE 'other';--> statement-breakpoint
ALTER TYPE "public"."lead_source" ADD VALUE 'twitter' BEFORE 'other';--> statement-breakpoint
ALTER TYPE "public"."lead_source" ADD VALUE 'existing' BEFORE 'other';--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid,
	"label" text NOT NULL,
	"status" "inventory_status" DEFAULT 'available' NOT NULL,
	"credentials" text,
	"order_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;