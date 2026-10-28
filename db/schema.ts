import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** provider: "smtp" | "gmail_oauth" (only "smtp" is used until Phase 3) */
/** health: "healthy" | "degraded" | "paused" */
export const mailboxes = pgTable("mailboxes", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").notNull(),
  fromName: text("from_name").notNull(),
  fromEmail: text("from_email").notNull(),
  encryptedCredentials: text("encrypted_credentials").notNull(),
  dailyCap: integer("daily_cap").notNull().default(50),
  rampStartedAt: timestamp("ramp_started_at", { withTimezone: true }),
  lastPolledAt: timestamp("last_polled_at", { withTimezone: true }),
  lastHistoryId: text("last_history_id"),
  health: text("health").notNull().default("healthy"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** status: "draft" | "active" | "paused" | "completed" */
export const campaigns = pgTable("campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  postalAddress: text("postal_address").notNull(),
  status: text("status").notNull().default("draft"),
  businessHoursStart: integer("business_hours_start").notNull().default(9),
  businessHoursEnd: integer("business_hours_end").notNull().default(16),
  /** Day-of-week integers, 0=Sunday..6=Saturday. Default Tue/Wed/Thu. */
  businessDays: jsonb("business_days")
    .notNull()
    .default([2, 3, 4])
    .$type<number[]>(),
  baseIntervalSeconds: integer("base_interval_seconds").notNull().default(60),
  domainThrottleLimit: integer("domain_throttle_limit").notNull().default(3),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** A campaign's mailbox pool (Phase 4+). Campaigns send from an explicit,
 * admin-picked set of mailboxes rather than one fixed mailbox; each
 * enrollment is then stickily assigned to one pool member at scheduling
 * time (see enrollments.mailboxId below). */
export const campaignMailboxes = pgTable(
  "campaign_mailboxes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id),
    mailboxId: uuid("mailbox_id")
      .notNull()
      // A disconnected mailbox drops out of every pool it was ever part of
      // - a pool-membership row has no meaning once the mailbox side is
      // gone, unlike enrollments.mailboxId below, which is kept as
      // historical record.
      .references(() => mailboxes.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("campaign_mailboxes_campaign_mailbox_idx").on(table.campaignId, table.mailboxId)],
);

/** Up to 5 steps per campaign (enforced by the create-campaign Zod schema,
 * not a DB constraint). subject_template/body_template lived directly on
 * campaigns in Phase 1; a data-preserving migration carries any existing
 * campaign's templates into its step 1 row here. */
export const sequenceSteps = pgTable(
  "sequence_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id),
    stepOrder: integer("step_order").notNull(),
    subjectTemplate: text("subject_template").notNull(),
    bodyTemplate: text("body_template").notNull(),
    /** Days after the *previous* step (or after the campaign starts, for
     * step 1, where it is always 0). */
    delayDays: integer("delay_days").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("sequence_steps_campaign_order_idx").on(table.campaignId, table.stepOrder)],
);

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    fields: jsonb("fields").notNull().default({}).$type<Record<string, string>>(),
    timezone: text("timezone").notNull().default("UTC"),
    consentBasis: text("consent_basis").notNull().default("b2b_legitimate_interest"),
    source: text("source"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("contacts_email_idx").on(table.email)],
);

/** status: "pending" | "active" | "replied" | "bounced" | "unsubscribed" | "completed" | "failed" */
export const enrollments = pgTable(
  "enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id),
    // Sticky assignment from the campaign's pool, set once when the
    // enrollment is first scheduled (campaign start) - every later step in
    // its sequence keeps sending from here. Nullable: unset while
    // "pending" (imported but not yet scheduled), and set back to null if
    // the mailbox is later disconnected - the enrollment itself (and its
    // messages) stays as historical record, it just loses the "sent from"
    // attribution.
    mailboxId: uuid("mailbox_id").references(() => mailboxes.id, { onDelete: "set null" }),
    status: text("status").notNull().default("pending"),
    currentStep: integer("current_step").notNull().default(1),
    // Nullable: unset while "pending" (imported but campaign not yet started).
    nextSendAt: timestamp("next_send_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("enrollments_campaign_contact_idx").on(table.campaignId, table.contactId)],
);

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  enrollmentId: uuid("enrollment_id")
    .notNull()
    .references(() => enrollments.id),
  stepId: uuid("step_id").references(() => sequenceSteps.id),
  providerThreadId: text("provider_thread_id"),
  rfcMessageId: text("rfc_message_id").notNull(),
  status: text("status").notNull().default("sent"),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
});

/** One row per message in a Replies thread that isn't a templated sequence
 * step send (those stay tracked in `messages`, as before) - inbound replies
 * from the poller (see worker/poller.ts's handleReplies()), and an
 * operator's own free-text replies sent from the Replies inbox.
 * `direction` distinguishes them: "in" for a contact's reply, "out" for an
 * operator's. `status`/`snoozedUntil` only carry meaning on "in" rows and
 * drive the Replies inbox's filter tabs and thread actions: "unhandled" on
 * insert, "handled" once an operator marks it (or replies), "snoozed" until
 * `snoozedUntil`. `unsubscribeRequested` is a simple keyword match against
 * the message body - not a general sentiment classifier, just enough to
 * flag threads worth prioritizing. */
export const replies = pgTable("replies", {
  id: uuid("id").primaryKey().defaultRandom(),
  enrollmentId: uuid("enrollment_id")
    .notNull()
    .references(() => enrollments.id),
  mailboxId: uuid("mailbox_id").references(() => mailboxes.id, { onDelete: "set null" }),
  direction: text("direction").notNull().default("in"),
  rfcMessageId: text("rfc_message_id"),
  providerThreadId: text("provider_thread_id"),
  fromAddress: text("from_address").notNull(),
  subject: text("subject").notNull().default(""),
  snippet: text("snippet").notNull().default(""),
  bodyText: text("body_text").notNull().default(""),
  status: text("status").notNull().default("unhandled"),
  snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
  unsubscribeRequested: boolean("unsubscribe_requested").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const suppressions = pgTable(
  "suppressions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("suppressions_email_idx").on(table.email)],
);

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull(),
  payload: jsonb("payload").notNull().default({}).$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** role: "admin" | "member" */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("users_email_idx").on(table.email)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("sessions_token_hash_idx").on(table.tokenHash)],
);

/** Exactly two rows ever exist ("worker", "poller") - a text primary key
 * instead of a uuid, upserted every tick/poll cycle by the process itself.
 * `lastResult` is that cycle's already-computed TickResult/PollResult
 * object, stored as-is for the dashboard to display. */
export const workerHeartbeats = pgTable("worker_heartbeats", {
  process: text("process").primaryKey(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }).notNull(),
  lastResult: jsonb("last_result").notNull().default({}).$type<Record<string, unknown>>(),
});
