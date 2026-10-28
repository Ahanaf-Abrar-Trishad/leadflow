CREATE TABLE "worker_heartbeats" (
	"process" text PRIMARY KEY NOT NULL,
	"last_run_at" timestamp with time zone NOT NULL,
	"last_result" jsonb DEFAULT '{}'::jsonb NOT NULL
);
