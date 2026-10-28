ALTER TABLE "campaign_mailboxes" DROP CONSTRAINT "campaign_mailboxes_mailbox_id_mailboxes_id_fk";
--> statement-breakpoint
ALTER TABLE "enrollments" DROP CONSTRAINT "enrollments_mailbox_id_mailboxes_id_fk";
--> statement-breakpoint
ALTER TABLE "campaign_mailboxes" ADD CONSTRAINT "campaign_mailboxes_mailbox_id_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."mailboxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_mailbox_id_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."mailboxes"("id") ON DELETE set null ON UPDATE no action;