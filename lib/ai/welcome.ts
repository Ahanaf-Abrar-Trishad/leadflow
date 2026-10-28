import { and, eq } from "drizzle-orm";
import { db, runAtomic } from "@/db/client";
import { aiDrafts, deals, onboardings } from "@/db/schema";
import { DraftError } from "./icebreaker";

export const WELCOME_MAX_LENGTH = 3000;

/** Stores Claude's welcome email for a new client, replacing a pending one.
 * The operator sends it from the client page; LeadFlow appends the intake
 * and kickoff links, so the draft must not contain links of its own. */
export async function saveWelcomeDraft(dealId: string, text: string): Promise<string> {
  const content = text.replace(/\r\n/g, "\n").trim();
  if (content.length < 40) throw new DraftError("A welcome email must be at least 40 characters.");
  if (content.length > WELCOME_MAX_LENGTH) throw new DraftError(`A welcome email must be at most ${WELCOME_MAX_LENGTH} characters.`);
  if (/https?:\/\//i.test(content)) throw new DraftError("Leave links out; LeadFlow adds the form and kickoff links itself.");

  const [row] = await db
    .select({ enrollmentId: deals.enrollmentId, welcomeSentAt: onboardings.welcomeSentAt })
    .from(onboardings)
    .innerJoin(deals, eq(deals.id, onboardings.dealId))
    .where(eq(onboardings.dealId, dealId));
  if (!row) throw new DraftError("That client has not started onboarding.");
  if (row.welcomeSentAt) throw new DraftError("That client has already been welcomed.");
  if (!row.enrollmentId) throw new DraftError("That client has no email conversation.");
  const enrollmentId = row.enrollmentId;

  return runAtomic(async (tx) => {
    await tx
      .delete(aiDrafts)
      .where(and(eq(aiDrafts.enrollmentId, enrollmentId), eq(aiDrafts.kind, "welcome"), eq(aiDrafts.status, "pending")));
    const [draft] = await tx.insert(aiDrafts).values({ enrollmentId, kind: "welcome", content }).returning({ id: aiDrafts.id });
    return draft.id;
  });
}

export async function getPendingWelcomeDraft(enrollmentId: string) {
  const [draft] = await db
    .select({ id: aiDrafts.id, content: aiDrafts.content })
    .from(aiDrafts)
    .where(and(eq(aiDrafts.enrollmentId, enrollmentId), eq(aiDrafts.kind, "welcome"), eq(aiDrafts.status, "pending")));
  return draft ?? null;
}

export async function markWelcomeDraftSent(draftId: string, enrollmentId: string, sentText: string): Promise<void> {
  const [draft] = await db.select().from(aiDrafts).where(eq(aiDrafts.id, draftId));
  if (!draft || draft.enrollmentId !== enrollmentId || draft.kind !== "welcome" || draft.status !== "pending") return;
  await db
    .update(aiDrafts)
    .set({ status: "approved", content: sentText, edited: sentText !== draft.content, reviewedAt: new Date() })
    .where(eq(aiDrafts.id, draftId));
}
