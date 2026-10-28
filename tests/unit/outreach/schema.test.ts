import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import {
  mailboxes,
  campaigns,
  campaignMailboxes,
  contacts,
  enrollments,
  messages,
  suppressions,
  events,
  users,
  sessions,
  sequenceSteps,
  workerHeartbeats,
} from "@/db/schema";

function columnNames(table: PgTable) {
  return getTableConfig(table).columns.map((column) => column.name);
}

describe("outreach db schema", () => {
  it("defines the expected mailbox columns", () => {
    expect(columnNames(mailboxes)).toEqual(
      expect.arrayContaining([
        "id",
        "provider",
        "from_name",
        "from_email",
        "encrypted_credentials",
        "daily_cap",
        "ramp_started_at",
        "health",
        "created_at",
      ]),
    );
  });

  it("defines the expected campaign columns", () => {
    // subject_template/body_template moved to sequence_steps in Phase 2 -
    // see "defines the expected sequence step columns..." below.
    // mailbox_id moved to campaign_mailboxes (a pool) in Phase 4 - see
    // "defines the mailbox pool and sticky enrollment assignment" below.
    expect(columnNames(campaigns)).toEqual(
      expect.arrayContaining([
        "id",
        "name",
        "postal_address",
        "status",
        "business_hours_start",
        "business_hours_end",
        "business_days",
        "base_interval_seconds",
        "domain_throttle_limit",
      ]),
    );
  });

  it("defines the expected contact columns", () => {
    expect(columnNames(contacts)).toEqual(
      expect.arrayContaining(["id", "email", "fields", "timezone", "consent_basis", "source"]),
    );
  });

  it("defines the expected enrollment columns", () => {
    expect(columnNames(enrollments)).toEqual(
      expect.arrayContaining(["id", "campaign_id", "contact_id", "status", "next_send_at", "sent_at"]),
    );
  });

  it("defines the expected message, suppression, and event columns", () => {
    expect(columnNames(messages)).toEqual(
      expect.arrayContaining(["id", "enrollment_id", "rfc_message_id", "status", "sent_at"]),
    );
    expect(columnNames(suppressions)).toEqual(expect.arrayContaining(["id", "email", "reason"]));
    expect(columnNames(events)).toEqual(expect.arrayContaining(["id", "type", "payload"]));
  });

  it("defines the expected user and session columns", () => {
    expect(columnNames(users)).toEqual(
      expect.arrayContaining(["id", "email", "password_hash", "role", "created_at"]),
    );
    expect(columnNames(sessions)).toEqual(
      expect.arrayContaining(["id", "user_id", "token_hash", "expires_at", "created_at"]),
    );
  });

  it("defines the expected sequence step columns and the new step-tracking columns", () => {
    expect(columnNames(sequenceSteps)).toEqual(
      expect.arrayContaining([
        "id",
        "campaign_id",
        "step_order",
        "subject_template",
        "body_template",
        "delay_days",
        "created_at",
      ]),
    );
    expect(columnNames(enrollments)).toEqual(expect.arrayContaining(["current_step"]));
    expect(columnNames(messages)).toEqual(expect.arrayContaining(["step_id"]));
    expect(columnNames(mailboxes)).toEqual(expect.arrayContaining(["last_polled_at"]));
    expect(columnNames(campaigns)).not.toEqual(expect.arrayContaining(["subject_template", "body_template"]));
  });

  it("defines the Gmail-specific history/thread tracking columns", () => {
    expect(columnNames(mailboxes)).toEqual(expect.arrayContaining(["last_history_id"]));
    expect(columnNames(messages)).toEqual(expect.arrayContaining(["provider_thread_id"]));
  });

  it("defines the mailbox pool and sticky enrollment assignment", () => {
    expect(columnNames(campaignMailboxes)).toEqual(
      expect.arrayContaining(["id", "campaign_id", "mailbox_id", "created_at"]),
    );
    expect(columnNames(enrollments)).toEqual(expect.arrayContaining(["mailbox_id"]));
    expect(columnNames(campaigns)).not.toEqual(expect.arrayContaining(["mailbox_id"]));
  });

  it("defines the worker/poller heartbeat table", () => {
    expect(columnNames(workerHeartbeats)).toEqual(
      expect.arrayContaining(["process", "last_run_at", "last_result"]),
    );
  });
});
