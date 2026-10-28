import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { db, runAtomic } from "@/db/client";
import { campaigns, contacts, enrollments } from "@/db/schema";
import { importContactsSchema } from "@/lib/outreach/contacts/importSchema";
import { validateContactRows } from "@/lib/outreach/contacts/validateRows";
import { dedupeContacts } from "@/lib/outreach/contacts/dedupe";
import { planCampaignEnrollment } from "@/lib/outreach/campaigns/enrollNewContacts";

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

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = importContactsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: z.flattenError(parsed.error) }, { status: 400 });
  }
  const { campaignId, emailColumn, fieldMapping, rows } = parsed.data;

  const { valid, invalid } = validateContactRows(rows, emailColumn, fieldMapping);
  const { toInsert, skippedExisting, skippedSuppressed } = await dedupeContacts(valid);

  const insertedIds: string[] = [];
  if (toInsert.length > 0) {
    const inserted = await db
      .insert(contacts)
      .values(toInsert.map((row) => ({ email: row.email, fields: row.fields })))
      .returning({ id: contacts.id });
    insertedIds.push(...inserted.map((r) => r.id));
  }

  // Rows that matched an existing contact still need enrolling in *this*
  // campaign — they were only skipped from re-insertion, not from sending.
  let reenrolledIds: string[] = [];
  if (skippedExisting.length > 0) {
    const existingRows = await db
      .select({ id: contacts.id, email: contacts.email })
      .from(contacts)
      .where(inArray(contacts.email, skippedExisting));
    const byEmail = new Map(existingRows.map((r) => [r.email, r.id]));
    reenrolledIds = skippedExisting.map((email) => byEmail.get(email)).filter((id): id is string => Boolean(id));
  }

  const allContactIds = [...insertedIds, ...reenrolledIds];
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

  return NextResponse.json({ imported: allContactIds.length, invalidRows: invalid, skippedSuppressed, schedulingWarning });
}
