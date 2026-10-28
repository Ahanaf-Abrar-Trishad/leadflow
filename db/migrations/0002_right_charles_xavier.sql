-- 1. Create sequence_steps first (it doesn't depend on the columns being dropped)
CREATE TABLE "sequence_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"step_order" integer NOT NULL,
	"subject_template" text NOT NULL,
	"body_template" text NOT NULL,
	"delay_days" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sequence_steps" ADD CONSTRAINT "sequence_steps_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "sequence_steps_campaign_order_idx" ON "sequence_steps" USING btree ("campaign_id","step_order");
--> statement-breakpoint

-- 2. Carry forward every existing campaign's template as its step 1, BEFORE
--    the columns holding that data are dropped. This is the line drizzle-kit
--    does not generate on its own - a plain add/drop would silently lose
--    every campaign's message content.
INSERT INTO "sequence_steps" (campaign_id, step_order, subject_template, body_template, delay_days)
SELECT id, 1, subject_template, body_template, 0 FROM "campaigns";
--> statement-breakpoint

-- 3. Now it's safe to drop the old columns
ALTER TABLE "campaigns" DROP COLUMN "subject_template";
--> statement-breakpoint
ALTER TABLE "campaigns" DROP COLUMN "body_template";
--> statement-breakpoint

-- 4. The other additive changes, any order
ALTER TABLE "enrollments" ADD COLUMN "current_step" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "mailboxes" ADD COLUMN "last_polled_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "step_id" uuid;
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_step_id_sequence_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."sequence_steps"("id") ON DELETE no action ON UPDATE no action;
