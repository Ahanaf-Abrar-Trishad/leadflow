import { and, asc, count, desc, eq, inArray, isNotNull, isNull, notExists, sql } from "drizzle-orm";
import { db, runAtomic } from "@/db/client";
import { aiDrafts, contacts, leads } from "@/db/schema";
import { PAGE_SIZE, pageOffset } from "@/lib/outreach/pagination";
import { DraftError, validateIcebreaker } from "./icebreaker";

export { DraftError };

/** Leads Claude should write an opening line for: reachable, not
 * disqualified, no approved line yet, and nothing already waiting for review
 * or turned down (a rejected lead is the operator's call to revisit). */
function needsIcebreaker() {
  return and(
    inArray(leads.status, ["new", "in_campaign"]),
    isNotNull(leads.email),
    isNull(leads.icebreaker),
    notExists(
      db
        .select({ id: aiDrafts.id })
        .from(aiDrafts)
        .where(
          and(eq(aiDrafts.leadId, leads.id), eq(aiDrafts.kind, "icebreaker"), inArray(aiDrafts.status, ["pending", "rejected"])),
        ),
    ),
  );
}

export async function listLeadsNeedingIcebreaker(limit: number) {
  return db
    .select({
      id: leads.id,
      name: leads.name,
      category: leads.category,
      website: leads.website,
      address: leads.address,
      rating: leads.rating,
      reviewCount: leads.reviewCount,
      score: leads.score,
    })
    .from(leads)
    .where(needsIcebreaker())
    .orderBy(desc(leads.score), asc(leads.createdAt))
    .limit(limit);
}

export async function getQueueStatus() {
  const [[needing], [pending]] = await Promise.all([
    db.select({ value: count() }).from(leads).where(needsIcebreaker()),
    db.select({ value: count() }).from(aiDrafts).where(eq(aiDrafts.status, "pending")),
  ]);
  return { leadsNeedingIcebreaker: needing.value, draftsAwaitingReview: pending.value };
}

export async function countPendingDrafts(): Promise<number> {
  const [row] = await db.select({ value: count() }).from(aiDrafts).where(eq(aiDrafts.status, "pending"));
  return row.value;
}

/** Stores Claude's draft for review, replacing any draft still pending for
 * the same lead. */
export async function saveIcebreakerDraft(leadId: string, content: string, observations: string): Promise<string> {
  const text = validateIcebreaker(content);
  const [lead] = await db.select({ id: leads.id, status: leads.status }).from(leads).where(eq(leads.id, leadId));
  if (!lead) throw new DraftError("No lead with that id.");
  if (lead.status === "disqualified") throw new DraftError("That lead has been disqualified.");

  return runAtomic(async (tx) => {
    await tx
      .delete(aiDrafts)
      .where(and(eq(aiDrafts.leadId, leadId), eq(aiDrafts.kind, "icebreaker"), eq(aiDrafts.status, "pending")));
    const [draft] = await tx
      .insert(aiDrafts)
      .values({ leadId, kind: "icebreaker", content: text, observations: observations.trim().slice(0, 2000) })
      .returning({ id: aiDrafts.id });
    return draft.id;
  });
}

/**
 * Approves a pending draft, optionally with the operator's edited text. The
 * approved line becomes the lead's {{icebreaker}}, and - if the lead is
 * already a contact in a campaign - that contact's merge field too, so
 * approving after enrolling still reaches the not-yet-sent emails.
 */
export async function approveDraft(draftId: string, editedContent?: string): Promise<void> {
  const [draft] = await db.select().from(aiDrafts).where(eq(aiDrafts.id, draftId));
  if (!draft || draft.status !== "pending") throw new DraftError("This draft is no longer waiting for review.");
  const finalText = validateIcebreaker(editedContent ?? draft.content);

  await runAtomic(async (tx) => {
    await tx
      .update(aiDrafts)
      .set({ status: "approved", content: finalText, edited: finalText !== draft.content, reviewedAt: new Date() })
      .where(eq(aiDrafts.id, draftId));
    const [lead] = await tx
      .update(leads)
      .set({ icebreaker: finalText, updatedAt: new Date() })
      .where(eq(leads.id, draft.leadId))
      .returning({ contactId: leads.contactId });
    if (lead?.contactId) {
      await tx
        .update(contacts)
        .set({ fields: sql`${contacts.fields} || ${JSON.stringify({ icebreaker: finalText })}::jsonb` })
        .where(eq(contacts.id, lead.contactId));
    }
  });
}

export async function rejectDraft(draftId: string): Promise<void> {
  const updated = await db
    .update(aiDrafts)
    .set({ status: "rejected", reviewedAt: new Date() })
    .where(and(eq(aiDrafts.id, draftId), eq(aiDrafts.status, "pending")))
    .returning({ id: aiDrafts.id });
  if (updated.length === 0) throw new DraftError("This draft is no longer waiting for review.");
}

export async function listPendingDrafts(page: number) {
  const rows = await db
    .select({
      id: aiDrafts.id,
      content: aiDrafts.content,
      observations: aiDrafts.observations,
      createdAt: aiDrafts.createdAt,
      leadId: leads.id,
      leadName: leads.name,
      leadCategory: leads.category,
      leadWebsite: leads.website,
      leadEmail: leads.email,
      leadStatus: leads.status,
    })
    .from(aiDrafts)
    .innerJoin(leads, eq(leads.id, aiDrafts.leadId))
    .where(eq(aiDrafts.status, "pending"))
    .orderBy(asc(aiDrafts.createdAt))
    .limit(PAGE_SIZE + 1)
    .offset(pageOffset(page));
  return { rows: rows.slice(0, PAGE_SIZE), hasNextPage: rows.length > PAGE_SIZE };
}
