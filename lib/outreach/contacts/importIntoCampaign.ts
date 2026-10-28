import { eq, inArray } from "drizzle-orm";
import { db, runAtomic } from "@/db/client";
import { campaigns, contacts, enrollments } from "@/db/schema";
import { dedupeContacts } from "@/lib/outreach/contacts/dedupe";
import { planCampaignEnrollment } from "@/lib/outreach/campaigns/enrollNewContacts";
import type { ContactRowInput } from "@/lib/outreach/contacts/validateRows";

export interface ImportIntoCampaignResult {
  imported: number;
  skippedSuppressed: string[];
  schedulingWarning?: string;
  /** Contact id for every imported (new or existing) email. */
  contactIdByEmail: Map<string, string>;
}

function describeSkipReason(reason: string): string {
  switch (reason) {
    case "no_healthy_mailboxes":
      return "Imported, but no healthy mailbox is available to schedule them yet - they'll stay pending.";
    case "no_sequence_steps":
      return "Imported, but this campaign has no sequence steps - they'll stay pending.";
    case "preflight_failed":
      return "Imported, but preflight checks failed against the current pool - they'll stay pending until that's resolved.";
    default:
      return "Imported, but could not be scheduled yet - they'll stay pending.";
  }
}

/**
 * Creates contacts for already-validated rows (reusing any that exist,
 * skipping suppressed addresses), enrolls them in the campaign, and - if the
 * campaign is already running - schedules them straight away. Shared by the
 * CSV contact import and "add leads to campaign".
 */
export async function importContactsIntoCampaign(
  campaignId: string,
  rows: ContactRowInput[],
): Promise<ImportIntoCampaignResult> {
  const { toInsert, skippedExisting, skippedSuppressed } = await dedupeContacts(rows);
  const contactIdByEmail = new Map<string, string>();

  if (toInsert.length > 0) {
    const inserted = await db
      .insert(contacts)
      .values(
        toInsert.map((row) => ({
          email: row.email,
          fields: row.fields,
          ...(row.timezone ? { timezone: row.timezone } : {}),
          ...(row.source ? { source: row.source } : {}),
        })),
      )
      .returning({ id: contacts.id, email: contacts.email });
    for (const row of inserted) contactIdByEmail.set(row.email, row.id);
  }

  // Rows that matched an existing contact still need enrolling in *this*
  // campaign — they were only skipped from re-insertion, not from sending.
  if (skippedExisting.length > 0) {
    const existingRows = await db
      .select({ id: contacts.id, email: contacts.email })
      .from(contacts)
      .where(inArray(contacts.email, skippedExisting));
    for (const row of existingRows) contactIdByEmail.set(row.email, row.id);
  }

  const allContactIds = [...contactIdByEmail.values()];
  if (allContactIds.length > 0) {
    await db
      .insert(enrollments)
      .values(allContactIds.map((contactId) => ({ campaignId, contactId, status: "pending" as const })))
      .onConflictDoNothing();
  }

  let schedulingWarning: string | undefined;
  if (allContactIds.length > 0) {
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    if (campaign && campaign.status === "active") {
      const plan = await planCampaignEnrollment(campaign);
      if (plan.scheduled.length > 0) {
        await runAtomic(async (tx) => {
          for (const item of plan.scheduled) {
            await tx
              .update(enrollments)
              .set({ status: "active", mailboxId: item.mailboxId, nextSendAt: item.nextSendAt })
              .where(eq(enrollments.id, item.id));
          }
        });
      } else if (plan.skippedReason && plan.skippedReason !== "no_pending_contacts") {
        schedulingWarning = describeSkipReason(plan.skippedReason);
      }
    }
  }

  return { imported: allContactIds.length, skippedSuppressed, schedulingWarning, contactIdByEmail };
}
