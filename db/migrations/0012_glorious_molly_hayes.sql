CREATE TABLE "proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"sections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"line_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"terms" text DEFAULT '' NOT NULL,
	"valid_until" timestamp with time zone,
	"link_version" integer DEFAULT 1 NOT NULL,
	"drafted_by" text DEFAULT 'operator' NOT NULL,
	"edited_by_operator" boolean DEFAULT false NOT NULL,
	"sent_at" timestamp with time zone,
	"first_viewed_at" timestamp with time zone,
	"last_viewed_at" timestamp with time zone,
	"view_count" integer DEFAULT 0 NOT NULL,
	"accepted_at" timestamp with time zone,
	"signer_name" text,
	"signer_email" text,
	"signer_ip" text,
	"signer_user_agent" text,
	"signed_snapshot" jsonb,
	"declined_at" timestamp with time zone,
	"decline_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "proposals_one_open_per_deal_idx" ON "proposals" USING btree ("deal_id") WHERE "proposals"."status" in ('draft', 'sent');--> statement-breakpoint
CREATE INDEX "proposals_deal_idx" ON "proposals" USING btree ("deal_id");