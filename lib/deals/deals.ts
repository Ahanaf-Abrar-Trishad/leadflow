import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { contacts, deals, enrollments, leads } from "@/db/schema";
import type { DealStage } from "./stages";

/** A readable name for the deal: the company merge field when the contact
 * came from a lead or a CSV with one, otherwise the email's domain. */
function dealTitle(fields: Record<string, string>, email: string): string {
  return fields.company?.trim() || email.split("@")[1] || email;
}

/** Creates the contact's deal if it has none. One deal per contact, so a
 * second reply (or a second campaign) never duplicates it. */
export async function ensureDealForEnrollment(enrollmentId: string): Promise<{ dealId: string; created: boolean } | null> {
  const [row] = await db
    .select({ contactId: contacts.id, email: contacts.email, fields: contacts.fields })
    .from(enrollments)
    .innerJoin(contacts, eq(contacts.id, enrollments.contactId))
    .where(eq(enrollments.id, enrollmentId));
  if (!row) return null;

  const [lead] = await db.select({ id: leads.id, name: leads.name }).from(leads).where(eq(leads.contactId, row.contactId)).limit(1);
  const inserted = await db
    .insert(deals)
    .values({
      contactId: row.contactId,
      leadId: lead?.id,
      enrollmentId,
      title: lead?.name ?? dealTitle(row.fields, row.email),
    })
    .onConflictDoNothing({ target: deals.contactId })
    .returning({ id: deals.id });
  if (inserted.length > 0) return { dealId: inserted[0].id, created: true };

  const [existing] = await db.select({ id: deals.id }).from(deals).where(eq(deals.contactId, row.contactId));
  return { dealId: existing.id, created: false };
}

export interface DealPatch {
  stage?: DealStage;
  valueUsd?: number | null;
  notes?: string;
  lostReason?: string | null;
}

export async function updateDeal(id: string, patch: DealPatch): Promise<boolean> {
  const [current] = await db.select({ stage: deals.stage }).from(deals).where(eq(deals.id, id));
  if (!current) return false;
  const now = new Date();
  await db
    .update(deals)
    .set({
      // Named fields only, so no extra property on the caller's object can
      // reach the row.
      ...(patch.stage !== undefined ? { stage: patch.stage } : {}),
      ...(patch.valueUsd !== undefined ? { valueUsd: patch.valueUsd } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      ...(patch.lostReason !== undefined ? { lostReason: patch.lostReason } : {}),
      ...(patch.stage && patch.stage !== current.stage ? { stageChangedAt: now } : {}),
      // A reason only means something on a lost deal.
      ...(patch.stage && patch.stage !== "lost" ? { lostReason: null } : {}),
      updatedAt: now,
    })
    .where(eq(deals.id, id));
  return true;
}

export async function listDeals() {
  return db
    .select({
      id: deals.id,
      title: deals.title,
      stage: deals.stage,
      valueUsd: deals.valueUsd,
      notes: deals.notes,
      lostReason: deals.lostReason,
      enrollmentId: deals.enrollmentId,
      stageChangedAt: deals.stageChangedAt,
      contactEmail: contacts.email,
    })
    .from(deals)
    .innerJoin(contacts, eq(contacts.id, deals.contactId))
    .orderBy(desc(deals.updatedAt));
}

export async function getDealForEnrollment(enrollmentId: string) {
  const [row] = await db
    .select({ id: deals.id, stage: deals.stage })
    .from(deals)
    .innerJoin(enrollments, eq(enrollments.contactId, deals.contactId))
    .where(eq(enrollments.id, enrollmentId));
  return row ?? null;
}
