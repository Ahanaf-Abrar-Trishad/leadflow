import { and, desc, eq, ilike, inArray, isNotNull, isNull, or, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { campaigns, leads, scrapeJobs } from "@/db/schema";
import { PAGE_SIZE, pageOffset } from "@/lib/outreach/pagination";

export interface LeadFilters {
  q?: string;
  source?: string;
  status?: string;
  email?: "with" | "without";
  job?: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseLeadFilters(params: Record<string, string | undefined>): LeadFilters {
  return {
    q: params.q?.trim() || undefined,
    source: ["gmaps", "scout", "csv"].includes(params.source ?? "") ? params.source : undefined,
    status: ["new", "in_campaign", "disqualified"].includes(params.status ?? "") ? params.status : undefined,
    email: params.email === "with" || params.email === "without" ? params.email : undefined,
    job: params.job && UUID_PATTERN.test(params.job) ? params.job : undefined,
  };
}

/** Query-string form of the filters, for links that must keep them. */
export function leadFiltersQuery(filters: LeadFilters, page?: number): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  if (page && page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `?${query}` : "";
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export async function listLeads(filters: LeadFilters, page: number) {
  const conditions: SQL[] = [];
  if (filters.q) {
    const pattern = `%${escapeLike(filters.q)}%`;
    conditions.push(
      or(ilike(leads.name, pattern), ilike(leads.email, pattern), ilike(leads.website, pattern), ilike(leads.category, pattern))!,
    );
  }
  if (filters.source) conditions.push(eq(leads.source, filters.source));
  if (filters.status) conditions.push(eq(leads.status, filters.status));
  if (filters.email === "with") conditions.push(isNotNull(leads.email));
  if (filters.email === "without") conditions.push(isNull(leads.email));
  if (filters.job) conditions.push(eq(leads.scrapeJobId, filters.job));

  const rows = await db
    .select()
    .from(leads)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(leads.score), desc(leads.createdAt))
    .limit(PAGE_SIZE + 1)
    .offset(pageOffset(page));

  return { rows: rows.slice(0, PAGE_SIZE), hasNextPage: rows.length > PAGE_SIZE };
}

/** Campaigns a lead can still be added to. */
export async function listEnrollableCampaigns() {
  return db
    .select({ id: campaigns.id, name: campaigns.name, status: campaigns.status })
    .from(campaigns)
    .where(inArray(campaigns.status, ["draft", "active", "paused"]))
    .orderBy(desc(campaigns.createdAt));
}

export async function listRecentScrapeJobs(limit = 20) {
  return db.select().from(scrapeJobs).orderBy(desc(scrapeJobs.createdAt)).limit(limit);
}
