import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db/client";
import { campaigns, contacts, enrollments, messages, replies, sequenceSteps } from "@/db/schema";
import { threadNeedsAttention, type ReplyFilter, type ReplyThread, type ThreadMessage } from "./types";

export type { ReplyFilter, ReplyThread, ThreadMessage };

async function allThreads(): Promise<ReplyThread[]> {
  const rows = await db
    .select({
      enrollmentId: replies.enrollmentId,
      status: replies.status,
      snoozedUntil: replies.snoozedUntil,
      subject: replies.subject,
      snippet: replies.snippet,
      unsubscribeRequested: replies.unsubscribeRequested,
      createdAt: replies.createdAt,
      contactEmail: contacts.email,
      campaignId: campaigns.id,
      campaignName: campaigns.name,
      currentStep: enrollments.currentStep,
    })
    .from(replies)
    .innerJoin(enrollments, eq(enrollments.id, replies.enrollmentId))
    .innerJoin(contacts, eq(contacts.id, enrollments.contactId))
    .innerJoin(campaigns, eq(campaigns.id, enrollments.campaignId))
    // An operator's own sent reply ("out") isn't a thing to triage - only
    // the contact's own messages ("in") drive the inbox list and its
    // unhandled/snoozed state.
    .where(eq(replies.direction, "in"))
    .orderBy(desc(replies.createdAt));

  // One row per enrollment - the first row encountered for a given
  // enrollment is its latest, since the query above is already ordered
  // newest-first.
  const byEnrollment = new Map<string, ReplyThread>();
  for (const row of rows) {
    if (!byEnrollment.has(row.enrollmentId)) byEnrollment.set(row.enrollmentId, row);
  }
  return [...byEnrollment.values()];
}

export async function getReplyThreads(filter: ReplyFilter = "unhandled", now: Date = new Date()): Promise<ReplyThread[]> {
  const threads = await allThreads();
  return filter === "unhandled" ? threads.filter((t) => threadNeedsAttention(t, now)) : threads;
}

export async function getReplyThread(enrollmentId: string): Promise<ReplyThread | null> {
  const threads = await allThreads();
  return threads.find((t) => t.enrollmentId === enrollmentId) ?? null;
}

export async function getUnhandledReplyCount(now: Date = new Date()): Promise<number> {
  const threads = await allThreads();
  return threads.filter((t) => threadNeedsAttention(t, now)).length;
}

export interface RecentReply {
  id: string;
  enrollmentId: string;
  contactEmail: string;
  campaignName: string;
  subject: string;
  createdAt: Date;
}

/** Individual inbound replies (not deduped to one per thread, unlike
 * getReplyThreads) since a specific date - backs the dashboard's "Replies
 * today" feed. */
export async function getRecentReplies(since: Date, limit = 8): Promise<RecentReply[]> {
  return db
    .select({
      id: replies.id,
      enrollmentId: replies.enrollmentId,
      contactEmail: contacts.email,
      campaignName: campaigns.name,
      subject: replies.subject,
      createdAt: replies.createdAt,
    })
    .from(replies)
    .innerJoin(enrollments, eq(enrollments.id, replies.enrollmentId))
    .innerJoin(contacts, eq(contacts.id, enrollments.contactId))
    .innerJoin(campaigns, eq(campaigns.id, enrollments.campaignId))
    .where(and(eq(replies.direction, "in"), gte(replies.createdAt, since)))
    .orderBy(desc(replies.createdAt))
    .limit(limit);
}

/** Merges outbound sends and inbound replies into one chronological thread.
 * Outbound content comes from the sequence step's *template* - the app
 * never persists the merge-field-rendered text it actually sent, only the
 * template plus a send record - so this shows the template, not a
 * byte-for-byte copy of what the contact received. */
export async function getThreadMessages(enrollmentId: string): Promise<ThreadMessage[]> {
  const [outboundRows, inboundRows] = await Promise.all([
    db
      .select({
        id: messages.id,
        sentAt: messages.sentAt,
        subjectTemplate: sequenceSteps.subjectTemplate,
        bodyTemplate: sequenceSteps.bodyTemplate,
      })
      .from(messages)
      .leftJoin(sequenceSteps, eq(sequenceSteps.id, messages.stepId))
      .where(eq(messages.enrollmentId, enrollmentId)),
    db.select().from(replies).where(eq(replies.enrollmentId, enrollmentId)),
  ]);

  const outbound: ThreadMessage[] = outboundRows.map((m) => ({
    id: m.id,
    direction: "out",
    at: m.sentAt,
    subject: m.subjectTemplate ?? "(sequence step)",
    text: m.bodyTemplate ?? "",
  }));

  const inbound: ThreadMessage[] = inboundRows.map((r) => ({
    id: r.id,
    direction: r.direction === "out" ? "out" : "in",
    at: r.createdAt,
    subject: r.subject,
    text: r.bodyText,
  }));

  return [...outbound, ...inbound].sort((a, b) => a.at.getTime() - b.at.getTime());
}
