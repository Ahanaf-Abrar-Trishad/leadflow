-- 1. Create campaign_mailboxes first (campaigns and mailboxes already exist)
CREATE TABLE "campaign_mailboxes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"mailbox_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaign_mailboxes" ADD CONSTRAINT "campaign_mailboxes_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "campaign_mailboxes" ADD CONSTRAINT "campaign_mailboxes_mailbox_id_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."mailboxes"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_mailboxes_campaign_mailbox_idx" ON "campaign_mailboxes" USING btree ("campaign_id","mailbox_id");
--> statement-breakpoint

-- 2. Add enrollments.mailbox_id (nullable - a "pending" enrollment has no
--    assignment yet)
ALTER TABLE "enrollments" ADD COLUMN "mailbox_id" uuid;
--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_mailbox_id_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."mailboxes"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

-- 3. Carry forward every existing campaign's single mailbox into its pool,
--    and backfill every existing enrollment's assignment from it, BEFORE
--    the column holding that data is dropped. This is the line drizzle-kit
--    does not generate on its own - a plain add/drop would silently lose
--    which mailbox every existing campaign and enrollment was using.
INSERT INTO "campaign_mailboxes" (campaign_id, mailbox_id)
SELECT id, mailbox_id FROM "campaigns";
--> statement-breakpoint

UPDATE "enrollments" SET mailbox_id = campaigns.mailbox_id
FROM "campaigns" WHERE campaigns.id = enrollments.campaign_id;
--> statement-breakpoint

-- 4. Now it's safe to drop the old column (this also drops its FK
--    constraint automatically, since the constraint lives on this same
--    table/column)
ALTER TABLE "campaigns" DROP COLUMN "mailbox_id";
