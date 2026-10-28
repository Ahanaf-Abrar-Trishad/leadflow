CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dedupe_key" text NOT NULL,
	"source" text NOT NULL,
	"scrape_job_id" uuid,
	"name" text NOT NULL,
	"contact_name" text,
	"category" text,
	"email" text,
	"email_source" text,
	"phone" text,
	"website" text,
	"address" text,
	"timezone" text,
	"rating" double precision,
	"review_count" integer,
	"platform" text,
	"profile_url" text,
	"followers" integer,
	"socials" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"contact_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scrape_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text DEFAULT 'gmaps' NOT NULL,
	"keyword" text NOT NULL,
	"location" text NOT NULL,
	"depth" integer NOT NULL,
	"collect_emails" boolean DEFAULT true NOT NULL,
	"max_time_seconds" integer NOT NULL,
	"external_job_id" text,
	"status" text DEFAULT 'running' NOT NULL,
	"error" text,
	"leads_found" integer DEFAULT 0 NOT NULL,
	"leads_added" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_scrape_job_id_scrape_jobs_id_fk" FOREIGN KEY ("scrape_job_id") REFERENCES "public"."scrape_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "leads_dedupe_key_idx" ON "leads" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "leads_scrape_job_idx" ON "leads" USING btree ("scrape_job_id");--> statement-breakpoint
CREATE INDEX "leads_created_at_idx" ON "leads" USING btree ("created_at");