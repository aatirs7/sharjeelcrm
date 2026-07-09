CREATE TYPE "public"."ticket_type" AS ENUM('purchase', 'support', 'question', 'other');--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "ticket_type" "ticket_type";