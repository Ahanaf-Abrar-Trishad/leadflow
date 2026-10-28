import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
  doublePrecision,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

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
  /** Claude's read of an inbound reply (lib/ai/replies.ts): "interested" |
   * "question" | "not_now" | "not_interested" | "unsubscribe" |
   * "out_of_office" | "other". A label for the operator only - nothing acts
   * on it except creating a pipeline deal for "interested". */
  classification: text("classification"),
  classificationNote: text("classification_note"),
  classifiedAt: timestamp("classified_at", { withTimezone: true }),
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

/** One Google Maps scrape submitted to the gmaps-scraper engine.
 * status: "running" | "done" | "failed". `externalJobId` is the engine's own
 * job id; worker/scrapes.ts polls it and imports the results into `leads`. */
export const scrapeJobs = pgTable("scrape_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  source: text("source").notNull().default("gmaps"),
  keyword: text("keyword").notNull(),
  location: text("location").notNull(),
  depth: integer("depth").notNull(),
  collectEmails: boolean("collect_emails").notNull().default(true),
  maxTimeSeconds: integer("max_time_seconds").notNull(),
  externalJobId: text("external_job_id"),
  status: text("status").notNull().default("running"),
  error: text("error"),
  leadsFound: integer("leads_found").notNull().default(0),
  leadsAdded: integer("leads_added").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

/** A prospect before it becomes an outreach contact. Leads arrive from a
 * Google Maps scrape, a Scout export or a generic CSV, and the same business
 * arriving twice merges into one row through `dedupeKey` (see
 * lib/leads/normalize.ts). A lead needs an email before it can be added to a
 * campaign, at which point `contactId` links it to the `contacts` row.
 * source: "gmaps" | "scout" | "csv"
 * status: "new" | "in_campaign" | "disqualified" */
export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dedupeKey: text("dedupe_key").notNull(),
    source: text("source").notNull(),
    scrapeJobId: uuid("scrape_job_id").references(() => scrapeJobs.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    contactName: text("contact_name"),
    category: text("category"),
    email: text("email"),
    emailSource: text("email_source"),
    phone: text("phone"),
    website: text("website"),
    address: text("address"),
    timezone: text("timezone"),
    rating: doublePrecision("rating"),
    reviewCount: integer("review_count"),
    platform: text("platform"),
    profileUrl: text("profile_url"),
    followers: integer("followers"),
    socials: jsonb("socials").notNull().default({}).$type<Record<string, string>>(),
    score: integer("score").notNull().default(0),
    status: text("status").notNull().default("new"),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    /** The operator-approved opening line, available to templates as
     * {{icebreaker}}. Only ever set by approving an ai_drafts row. */
    icebreaker: text("icebreaker"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("leads_dedupe_key_idx").on(table.dedupeKey),
    index("leads_scrape_job_idx").on(table.scrapeJobId),
    index("leads_created_at_idx").on(table.createdAt),
  ],
);

/** Text Claude drafted through the MCP server, waiting for an operator.
 * Nothing Claude writes reaches a prospect until a person approves it: an
 * icebreaker on the Approvals page (lib/ai/drafts.ts), a reply or a welcome
 * email by sending it from the Replies inbox or the client page. One pending
 * draft per subject and kind - a newer draft replaces the pending one.
 * kind: "icebreaker" (has leadId) | "reply" | "welcome" (have enrollmentId)
 * status: "pending" | "approved" | "rejected" */
export const aiDrafts = pgTable(
  "ai_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }),
    enrollmentId: uuid("enrollment_id").references(() => enrollments.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("icebreaker"),
    content: text("content").notNull(),
    /** What Claude based the draft on, shown to the reviewer. */
    observations: text("observations").notNull().default(""),
    status: text("status").notNull().default("pending"),
    /** True when the operator changed the text before approving. */
    edited: boolean("edited").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("ai_drafts_one_pending_idx")
      .on(table.leadId, table.kind)
      .where(sql`${table.status} = 'pending'`),
    uniqueIndex("ai_drafts_one_pending_reply_idx")
      .on(table.enrollmentId, table.kind)
      .where(sql`${table.status} = 'pending'`),
    index("ai_drafts_status_idx").on(table.status, table.createdAt),
  ],
);

/** A conversation that could become a client - one per contact. Created when
 * Claude marks a reply "interested" or when an operator adds a thread to the
 * pipeline; proposals and payments (later stages) hang off it.
 * stage: "replied" | "call_booked" | "proposal" | "won" | "lost" */
export const deals = pgTable(
  "deals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    /** The thread the deal came from, for linking back to the conversation. */
    enrollmentId: uuid("enrollment_id").references(() => enrollments.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    stage: text("stage").notNull().default("replied"),
    /** Expected deal size in whole US dollars. */
    valueUsd: integer("value_usd"),
    notes: text("notes").notNull().default(""),
    lostReason: text("lost_reason"),
    stageChangedAt: timestamp("stage_changed_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("deals_contact_idx").on(table.contactId), index("deals_stage_idx").on(table.stage)],
);

export interface ProposalSection {
  heading: string;
  body: string;
}

/** amountUsd is null until the operator prices it - Claude never sets prices. */
export interface ProposalLineItem {
  description: string;
  amountUsd: number | null;
  billing: "one_time" | "monthly";
}

/** What the client saw and agreed to, frozen at the moment of acceptance. */
export interface ProposalSnapshot {
  title: string;
  summary: string;
  sections: ProposalSection[];
  lineItems: ProposalLineItem[];
  terms: string;
  validUntil: string | null;
  depositPercent?: number;
}

/** A priced proposal for a deal, accepted by the client on a public signed
 * link (/p/[token], lib/proposals). Content is editable only while "draft";
 * the link works only while "sent", and bumping linkVersion revokes every
 * link handed out before.
 * status: "draft" | "sent" | "accepted" | "declined" | "withdrawn"
 * draftedBy: "claude" | "operator" */
export const proposals = pgTable(
  "proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("draft"),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    sections: jsonb("sections").notNull().default([]).$type<ProposalSection[]>(),
    lineItems: jsonb("line_items").notNull().default([]).$type<ProposalLineItem[]>(),
    terms: text("terms").notNull().default(""),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    linkVersion: integer("link_version").notNull().default(1),
    /** Share of the one-time total billed on acceptance; the rest is billed
     * when the operator marks the work done. 100 = everything up front. */
    depositPercent: integer("deposit_percent").notNull().default(50),
    draftedBy: text("drafted_by").notNull().default("operator"),
    /** Once an operator edits a Claude draft, Claude may no longer overwrite it. */
    editedByOperator: boolean("edited_by_operator").notNull().default(false),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    firstViewedAt: timestamp("first_viewed_at", { withTimezone: true }),
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
    viewCount: integer("view_count").notNull().default(0),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    signerName: text("signer_name"),
    signerEmail: text("signer_email"),
    signerIp: text("signer_ip"),
    signerUserAgent: text("signer_user_agent"),
    signedSnapshot: jsonb("signed_snapshot").$type<ProposalSnapshot>(),
    declinedAt: timestamp("declined_at", { withTimezone: true }),
    declineReason: text("decline_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // At most one live proposal per deal; accepted, declined and withdrawn
    // ones stay as history.
    uniqueIndex("proposals_one_open_per_deal_idx")
      .on(table.dealId)
      .where(sql`${table.status} in ('draft', 'sent')`),
    index("proposals_deal_idx").on(table.dealId),
  ],
);

/** Money owed by a client, paid on a public signed link (/pay/[token]) by
 * card through Stripe, or marked paid by hand (wire, Zelle, check).
 * kind: "deposit" | "balance" | "full" | "monthly"
 * status: "open" | "processing" (bank payment on its way) | "paid" | "void"
 * method: "stripe" | "manual" */
export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    proposalId: uuid("proposal_id").references(() => proposals.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    description: text("description").notNull(),
    /** Cents, never floating dollars. For "monthly" this is the monthly amount. */
    amountCents: integer("amount_cents").notNull(),
    status: text("status").notNull().default("open"),
    method: text("method"),
    linkVersion: integer("link_version").notNull().default(1),
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    note: text("note"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("invoices_deal_idx").on(table.dealId),
    uniqueIndex("invoices_checkout_session_idx").on(table.stripeCheckoutSessionId),
  ],
);

export interface OnboardingTask {
  label: string;
  done: boolean;
}

/** Answers from the client's intake form (/intake/[token]). */
export type IntakeAnswers = Record<string, string>;

/** Getting a new client started, opened by their first payment. One per deal.
 * The intake form is a public signed link; its answers are untrusted text. */
export const onboardings = pgTable(
  "onboardings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    tasks: jsonb("tasks").notNull().default([]).$type<OnboardingTask[]>(),
    intakeLinkVersion: integer("intake_link_version").notNull().default(1),
    intakeAnswers: jsonb("intake_answers").$type<IntakeAnswers>(),
    intakeSubmittedAt: timestamp("intake_submitted_at", { withTimezone: true }),
    welcomeSentAt: timestamp("welcome_sent_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("onboardings_deal_idx").on(table.dealId)],
);
