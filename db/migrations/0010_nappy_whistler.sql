CREATE TABLE "ai_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"kind" text DEFAULT 'icebreaker' NOT NULL,
	"content" text NOT NULL,
	"observations" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"edited" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "icebreaker" text;--> statement-breakpoint
ALTER TABLE "ai_drafts" ADD CONSTRAINT "ai_drafts_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_drafts_one_pending_idx" ON "ai_drafts" USING btree ("lead_id","kind") WHERE "ai_drafts"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "ai_drafts_status_idx" ON "ai_drafts" USING btree ("status","created_at");