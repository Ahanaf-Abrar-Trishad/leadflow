import { and, asc, count, eq, isNull } from "drizzle-orm";
import { db, runAtomic } from "@/db/client";
import { aiDrafts, campaigns, contacts, enrollments, replies } from "@/db/schema";
import { ensureDealForEnrollment } from "@/lib/deals/deals";
import { NO_DRAFT_CATEGORIES, type ReplyCategory } from "@/lib/deals/stages";
import { getThreadMessages } from "@/lib/outreach/replies/queries";
import { DraftError } from "./icebreaker";

export const REPLY_DRAFT_MAX_LENGTH = 3000;
/** Enough of a long reply for Claude to understand it; quoted history below
 * this point is the thread itself, which is returned separately. */
const BODY_LIMIT = 4000;

function inboundUnclassified() {
  return and(eq(replies.direction, "in"), isNull(replies.classification));
}

export async function countRepliesToTriage(): Promise<number> {
  const [row] = await db.select({ value: count() }).from(replies).where(inboundUnclassified());
  return row.value;
}

/** Oldest unclassified inbound replies, each with the conversation before
 * it (outbound steps rendered the way the contact received them). */
export async function listRepliesToTriage(limit: number) {
  const rows = await db
    .select({
      replyId: replies.id,
      enrollmentId: replies.enrollmentId,
      receivedAt: replies.createdAt,
      subject: replies.subject,
      body: replies.bodyText,
      contactEmail: contacts.email,
      contactFields: contacts.fields,
      campaignName: campaigns.name,
    })
    .from(replies)
    .innerJoin(enrollments, eq(enrollments.id, replies.enrollmentId))
    .innerJoin(contacts, eq(contacts.id, enrollments.contactId))
    .innerJoin(campaigns, eq(campaigns.id, enrollments.campaignId))
    .where(inboundUnclassified())
    .orderBy(asc(replies.createdAt))
    .limit(limit);

  return Promise.all(
    rows.map(async (row) => {
      const thread = await getThreadMessages(row.enrollmentId);
      return {
        replyId: row.replyId,
        enrollmentId: row.enrollmentId,
        receivedAt: row.receivedAt,
        campaign: row.campaignName,
        contact: { email: row.contactEmail, company: row.contactFields.company, name: row.contactFields.first_name },
        reply: { subject: row.subject, body: row.body.slice(0, BODY_LIMIT) },
        thread: thread
          .filter((message) => message.id !== row.replyId)
          .map((message) => ({
            from: message.direction === "out" ? "us" : "them",
            at: message.at,
            text: message.text.slice(0, BODY_LIMIT),
          })),
      };
    }),
  );
}

export function validateReplyDraft(raw: string): string {
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (text.length < 10) throw new DraftError("A reply draft must be at least 10 characters.");
  if (text.length > REPLY_DRAFT_MAX_LENGTH) throw new DraftError(`A reply draft must be at most ${REPLY_DRAFT_MAX_LENGTH} characters.`);
  return text;
}

export interface TriageResult {
  dealCreated: boolean;
  draftSaved: boolean;
}

/**
 * Records Claude's read of a reply and, when it makes sense, a drafted
 * answer. Only an operator sending it from the Replies inbox ever delivers
 * the draft. "interested" also puts the contact in the pipeline. An
 * "unsubscribe" label is advisory: suppression stays the operator's call.
 */
export async function triageReply(
  replyId: string,
  category: ReplyCategory,
  note: string,
  draftReply?: string,
): Promise<TriageResult> {
  const [reply] = await db
    .select({ id: replies.id, enrollmentId: replies.enrollmentId, direction: replies.direction })
    .from(replies)
    .where(eq(replies.id, replyId));
  if (!reply || reply.direction !== "in") throw new DraftError("No inbound reply with that id.");

  const draftText = draftReply?.trim() ? validateReplyDraft(draftReply) : undefined;
  if (draftText && NO_DRAFT_CATEGORIES.includes(category)) {
    throw new DraftError(`Do not draft a reply for a "${category}" message; classify it without draft_reply.`);
  }

  await runAtomic(async (tx) => {
    await tx
      .update(replies)
      .set({ classification: category, classificationNote: note.trim().slice(0, 1000), classifiedAt: new Date() })
      .where(eq(replies.id, replyId));
    if (draftText) {
      await tx
        .delete(aiDrafts)
        .where(and(eq(aiDrafts.enrollmentId, reply.enrollmentId), eq(aiDrafts.kind, "reply"), eq(aiDrafts.status, "pending")));
      await tx.insert(aiDrafts).values({
        enrollmentId: reply.enrollmentId,
        kind: "reply",
        content: draftText,
        observations: note.trim().slice(0, 2000),
      });
    }
  });

  const deal = category === "interested" ? await ensureDealForEnrollment(reply.enrollmentId) : null;
  return { dealCreated: Boolean(deal?.created), draftSaved: Boolean(draftText) };
}

export async function getPendingReplyDraft(enrollmentId: string) {
  const [draft] = await db
    .select({ id: aiDrafts.id, content: aiDrafts.content, observations: aiDrafts.observations })
    .from(aiDrafts)
    .where(and(eq(aiDrafts.enrollmentId, enrollmentId), eq(aiDrafts.kind, "reply"), eq(aiDrafts.status, "pending")));
  return draft ?? null;
}

/** Called after the operator sent a reply that started from Claude's draft. */
export async function markReplyDraftSent(draftId: string, enrollmentId: string, sentText: string): Promise<void> {
  const [draft] = await db.select().from(aiDrafts).where(eq(aiDrafts.id, draftId));
  if (!draft || draft.enrollmentId !== enrollmentId || draft.status !== "pending") return;
  await db
    .update(aiDrafts)
    .set({ status: "approved", content: sentText, edited: sentText !== draft.content, reviewedAt: new Date() })
    .where(eq(aiDrafts.id, draftId));
}

export async function discardReplyDraft(enrollmentId: string): Promise<boolean> {
  const updated = await db
    .update(aiDrafts)
    .set({ status: "rejected", reviewedAt: new Date() })
    .where(and(eq(aiDrafts.enrollmentId, enrollmentId), eq(aiDrafts.kind, "reply"), eq(aiDrafts.status, "pending")))
    .returning({ id: aiDrafts.id });
  return updated.length > 0;
}
