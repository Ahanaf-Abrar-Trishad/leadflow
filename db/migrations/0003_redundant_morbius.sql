ALTER TABLE "mailboxes" ADD COLUMN "last_history_id" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "provider_thread_id" text;