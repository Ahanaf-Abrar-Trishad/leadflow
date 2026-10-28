import { eq, inArray, sql } from "drizzle-orm";
import { db, runAtomic } from "@/db/client";
import { leads } from "@/db/schema";
import { dedupeKeyFor, scoreLead, type LeadInput } from "./normalize";

export interface UpsertResult {
  added: number;
  updated: number;
  ids: string[];
}

/** Two rows for the same business in one batch: keep the first non-empty
 * value of each field, so a later row only fills gaps. */
function mergeInputs(first: LeadInput, second: LeadInput): LeadInput {
  const merged: Record<string, unknown> = { ...first };
  for (const [key, value] of Object.entries(second)) {
    if (merged[key] === undefined || merged[key] === "") merged[key] = value;
  }
  merged.socials = { ...second.socials, ...first.socials };
  return merged as unknown as LeadInput;
}

/** Fields an existing lead keeps when set, and takes from the new row when empty. */
const FILL_ONLY_COLUMNS = [
  "contact_name",
  "category",
  "email",
  "email_source",
  "phone",
  "website",
  "address",
  "timezone",
  "rating",
  "review_count",
  "platform",
  "profile_url",
  "followers",
] as const;

const BATCH_SIZE = 500;

/**
 * Stores leads, merging into an existing lead with the same dedupe key
 * instead of duplicating it. Merging only ever fills empty fields - a value
 * already on the lead (an email someone verified, a corrected phone) is never
 * overwritten by a later scrape. Scores are recomputed from the merged row.
 */
export async function upsertLeads(
  inputs: LeadInput[],
  options: { source: string; scrapeJobId?: string },
): Promise<UpsertResult> {
  const byKey = new Map<string, LeadInput>();
  for (const input of inputs) {
    const key = dedupeKeyFor(input, options.source);
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergeInputs(existing, input) : input);
  }

  const entries = [...byKey.entries()];
  let added = 0;
  const ids: string[] = [];

  for (let start = 0; start < entries.length; start += BATCH_SIZE) {
    const batch = entries.slice(start, start + BATCH_SIZE);
    const rows = await db
      .insert(leads)
      .values(
        batch.map(([dedupeKey, lead]) => ({
          dedupeKey,
          source: options.source,
          scrapeJobId: options.scrapeJobId,
          name: lead.name,
          contactName: lead.contactName,
          category: lead.category,
          email: lead.email,
          emailSource: lead.emailSource,
          phone: lead.phone,
          website: lead.website,
          address: lead.address,
          timezone: lead.timezone,
          rating: lead.rating,
          reviewCount: lead.reviewCount,
          platform: lead.platform,
          profileUrl: lead.profileUrl,
          followers: lead.followers,
          socials: lead.socials ?? {},
          score: scoreLead(lead),
        })),
      )
      .onConflictDoUpdate({
        target: leads.dedupeKey,
        set: {
          ...Object.fromEntries(
            FILL_ONLY_COLUMNS.map((column) => [
              column,
              sql.raw(`coalesce("leads"."${column}", excluded."${column}")`),
            ]),
          ),
          socials: sql`excluded.socials || ${leads.socials}`,
          updatedAt: sql`now()`,
        },
      })
      // xmax = 0 only on a freshly inserted row - the standard way to tell an
      // insert from a conflict-update in one statement.
      .returning({ id: leads.id, inserted: sql<boolean>`(xmax = 0)` });

    for (const row of rows) {
      ids.push(row.id);
      if (row.inserted) added += 1;
    }
  }

  await rescore(ids);
  return { added, updated: ids.length - added, ids };
}

/** Recomputes `score` from each lead's stored (merged) fields. */
export async function rescore(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const rows = await db.select().from(leads).where(inArray(leads.id, ids));
  const changes = rows
    .map((row) => ({
      id: row.id,
      score: scoreLead({
        name: row.name,
        email: row.email ?? undefined,
        phone: row.phone ?? undefined,
        website: row.website ?? undefined,
        rating: row.rating ?? undefined,
        reviewCount: row.reviewCount ?? undefined,
        followers: row.followers ?? undefined,
      }),
      previous: row.score,
    }))
    .filter((change) => change.score !== change.previous);
  if (changes.length === 0) return;
  await runAtomic(async (tx) => {
    for (const change of changes) {
      await tx.update(leads).set({ score: change.score }).where(eq(leads.id, change.id));
    }
  });
}
