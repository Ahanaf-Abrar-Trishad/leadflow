import { inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { contacts, suppressions } from "@/db/schema";
import type { ContactRowInput } from "./validateRows";

export interface DedupeResult {
  toInsert: ContactRowInput[];
  skippedExisting: string[];
  skippedSuppressed: string[];
}

export async function dedupeContacts(rows: ContactRowInput[]): Promise<DedupeResult> {
  const emails = rows.map((row) => row.email);
  if (emails.length === 0) {
    return { toInsert: [], skippedExisting: [], skippedSuppressed: [] };
  }

  const [existingRows, suppressedRows] = await Promise.all([
    db.select({ email: contacts.email }).from(contacts).where(inArray(contacts.email, emails)),
    db.select({ email: suppressions.email }).from(suppressions).where(inArray(suppressions.email, emails)),
  ]);

  const existing = new Set(existingRows.map((r) => r.email));
  const suppressed = new Set(suppressedRows.map((r) => r.email));

  const toInsert: ContactRowInput[] = [];
  const skippedExisting: string[] = [];
  const skippedSuppressed: string[] = [];

  for (const row of rows) {
    if (suppressed.has(row.email)) {
      skippedSuppressed.push(row.email);
    } else if (existing.has(row.email)) {
      skippedExisting.push(row.email);
    } else {
      toInsert.push(row);
    }
  }

  return { toInsert, skippedExisting, skippedSuppressed };
}
