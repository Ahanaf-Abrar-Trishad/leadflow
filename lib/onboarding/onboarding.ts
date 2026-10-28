import { and, desc, eq, isNotNull, isNull, notExists } from "drizzle-orm";
import { db } from "@/db/client";
import { aiDrafts, contacts, deals, events, onboardings, type OnboardingTask } from "@/db/schema";
import { linkKey, publicUrl, signLinkToken, verifyLinkToken } from "@/lib/links/signedLink";
import { cleanIntakeAnswers, DEFAULT_TASKS, OnboardingError } from "./content";

export { OnboardingError };

export type OnboardingRow = typeof onboardings.$inferSelect;

/** Opens onboarding for a deal (idempotent): the first payment calls this,
 * and an operator can too when a client paid outside LeadFlow. */
export async function startOnboarding(dealId: string): Promise<OnboardingRow> {
  await db.insert(onboardings).values({ dealId, tasks: DEFAULT_TASKS }).onConflictDoNothing({ target: onboardings.dealId });
  const [row] = await db.select().from(onboardings).where(eq(onboardings.dealId, dealId));
  return row;
}

export async function getOnboardingForDeal(dealId: string): Promise<OnboardingRow | null> {
  const [row] = await db.select().from(onboardings).where(eq(onboardings.dealId, dealId));
  return row ?? null;
}

export function intakeUrl(onboarding: Pick<OnboardingRow, "id" | "intakeLinkVersion">): string {
  return publicUrl(`/intake/${signLinkToken(onboarding.id, onboarding.intakeLinkVersion, linkKey("intake"))}`);
}

export async function getOnboardingByIntakeToken(token: string): Promise<OnboardingRow | null> {
  const parsed = verifyLinkToken(token, linkKey("intake"));
  if (!parsed) return null;
  const [row] = await db.select().from(onboardings).where(eq(onboardings.id, parsed.id));
  return row && row.intakeLinkVersion === parsed.linkVersion ? row : null;
}

/** Stores the client's answers. They can resubmit to correct something; the
 * latest answers win. Ticks the matching checklist item. */
export async function submitIntake(onboardingId: string, raw: Record<string, unknown>): Promise<void> {
  const answers = cleanIntakeAnswers(raw);
  const [row] = await db.select().from(onboardings).where(eq(onboardings.id, onboardingId));
  if (!row) throw new OnboardingError("This form is no longer available.");
  const now = new Date();
  await db
    .update(onboardings)
    .set({
      intakeAnswers: answers,
      intakeSubmittedAt: now,
      tasks: row.tasks.map((task) => (task.label === "Intake form submitted" ? { ...task, done: true } : task)),
      updatedAt: now,
    })
    .where(eq(onboardings.id, onboardingId));
  await db.insert(events).values({ type: "intake_submitted", payload: { onboardingId, dealId: row.dealId } });
}

export async function updateTasks(onboardingId: string, tasks: OnboardingTask[]): Promise<void> {
  const allDone = tasks.length > 0 && tasks.every((task) => task.done);
  const now = new Date();
  await db
    .update(onboardings)
    .set({ tasks, completedAt: allDone ? now : null, updatedAt: now })
    .where(eq(onboardings.id, onboardingId));
}

/** The kickoff call booking link (Calendly or similar), if configured. */
export function kickoffUrl(): string | null {
  const url = process.env.KICKOFF_URL?.trim();
  return url && /^https:\/\//.test(url) ? url : null;
}

/** The welcome email as sent: the operator's (or Claude's) text, then the
 * intake link and the kickoff link, always added by LeadFlow so they can
 * never be left out or mistyped. */
export function composeWelcome(text: string, onboarding: Pick<OnboardingRow, "id" | "intakeLinkVersion">): string {
  const kickoff = kickoffUrl();
  return [
    text.trim(),
    `Getting-started form (about 5 minutes): ${intakeUrl(onboarding)}`,
    kickoff ? `Book our kickoff call: ${kickoff}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function markWelcomeSent(onboardingId: string): Promise<void> {
  const [row] = await db.select().from(onboardings).where(eq(onboardings.id, onboardingId));
  if (!row) return;
  const now = new Date();
  await db
    .update(onboardings)
    .set({
      welcomeSentAt: now,
      tasks: row.tasks.map((task) => (task.label === "Send the welcome email" ? { ...task, done: true } : task)),
      updatedAt: now,
    })
    .where(eq(onboardings.id, onboardingId));
}

/** Clients whose welcome email Claude could draft: onboarding open, not
 * welcomed yet, an email thread to send in, and no draft already waiting. */
export async function listClientsNeedingWelcome(limit: number) {
  return db
    .select({
      dealId: deals.id,
      business: deals.title,
      contactEmail: contacts.email,
      enrollmentId: deals.enrollmentId,
      notes: deals.notes,
    })
    .from(onboardings)
    .innerJoin(deals, eq(deals.id, onboardings.dealId))
    .innerJoin(contacts, eq(contacts.id, deals.contactId))
    .where(
      and(
        isNull(onboardings.welcomeSentAt),
        isNotNull(deals.enrollmentId),
        notExists(
          db
            .select({ id: aiDrafts.id })
            .from(aiDrafts)
            .where(and(eq(aiDrafts.enrollmentId, deals.enrollmentId), eq(aiDrafts.kind, "welcome"), eq(aiDrafts.status, "pending"))),
        ),
      ),
    )
    .orderBy(desc(onboardings.createdAt))
    .limit(limit);
}
