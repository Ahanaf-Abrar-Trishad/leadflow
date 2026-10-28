import { config } from "dotenv";
import Papa from "papaparse";
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { leads, scrapeJobs } from "@/db/schema";
import { GmapsClient } from "@/lib/leads/gmaps/client";
import { mapRows } from "@/lib/leads/mapping";
import { rescore, upsertLeads } from "@/lib/leads/upsert";
import { findWebsiteEmail } from "@/lib/leads/websiteEmails";

config({ quiet: true });

const POLL_INTERVAL_MS = 20_000;
/** Grace on top of a job's own max_time before we stop waiting for it. */
const TIMEOUT_GRACE_MS = 15 * 60 * 1000;
const ENRICH_CONCURRENCY = 5;
/** Per job - a huge scrape still finishes in reasonable time. */
const ENRICH_LIMIT = 300;

export interface ScrapePollDeps {
  client: Pick<GmapsClient, "getStatus" | "downloadCsv" | "deleteJob">;
  findEmail: (website: string) => Promise<string | undefined>;
  now: Date;
}

export interface ScrapePollResult {
  checked: number;
  completed: number;
  failed: number;
}

/** Imports the engine's CSV for one finished job and returns the counts. */
export async function importJobResults(
  jobId: string,
  csv: string,
  collectEmails: boolean,
  findEmail: ScrapePollDeps["findEmail"],
): Promise<{ found: number; added: number }> {
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
  const { leads: mapped } = mapRows("gmaps", parsed.meta.fields ?? [], parsed.data);
  const result = await upsertLeads(mapped, { source: "gmaps", scrapeJobId: jobId });
  if (collectEmails) await enrichMissingEmails(result.ids, findEmail);
  return { found: mapped.length, added: result.added };
}

/**
 * The engine finds emails on a site's homepage only. For leads that still
 * have none, check the contact and about pages too - the same "deep email
 * pass" google-maps-scraper-kit runs.
 */
export async function enrichMissingEmails(ids: string[], findEmail: ScrapePollDeps["findEmail"]): Promise<number> {
  if (ids.length === 0) return 0;
  const todo = await db
    .select({ id: leads.id, website: leads.website })
    .from(leads)
    .where(and(inArray(leads.id, ids), isNull(leads.email), isNotNull(leads.website)))
    .limit(ENRICH_LIMIT);

  const foundIds: string[] = [];
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const lead = todo[next];
      next += 1;
      const email = await findEmail(lead.website!).catch(() => undefined);
      if (!email) continue;
      await db
        .update(leads)
        .set({ email, emailSource: "website", updatedAt: new Date() })
        .where(and(eq(leads.id, lead.id), isNull(leads.email)));
      foundIds.push(lead.id);
    }
  };
  await Promise.all(Array.from({ length: Math.min(ENRICH_CONCURRENCY, todo.length) }, worker));
  await rescore(foundIds);
  return foundIds.length;
}

export async function runScrapePoll(deps?: Partial<ScrapePollDeps>): Promise<ScrapePollResult> {
  const client = deps?.client ?? new GmapsClient();
  const findEmail = deps?.findEmail ?? ((website: string) => findWebsiteEmail(website));
  const now = deps?.now ?? new Date();

  const running = await db.select().from(scrapeJobs).where(eq(scrapeJobs.status, "running"));
  const result: ScrapePollResult = { checked: 0, completed: 0, failed: 0 };

  for (const job of running) {
    result.checked += 1;
    const deadline = job.createdAt.getTime() + job.maxTimeSeconds * 1000 + TIMEOUT_GRACE_MS;

    try {
      if (!job.externalJobId) throw new Error("Job was never accepted by the scraper engine.");
      const status = await client.getStatus(job.externalJobId);

      if (status === "ok") {
        const csv = await client.downloadCsv(job.externalJobId);
        const counts = await importJobResults(job.id, csv, job.collectEmails, findEmail);
        await db
          .update(scrapeJobs)
          .set({ status: "done", error: null, leadsFound: counts.found, leadsAdded: counts.added, finishedAt: new Date() })
          .where(eq(scrapeJobs.id, job.id));
        await client.deleteJob(job.externalJobId).catch(() => undefined);
        result.completed += 1;
      } else if (status === "failed") {
        await markFailed(job.id, "The scraper engine reported the job failed. Google may be rate-limiting this IP; wait, lower the depth or add proxies.");
        result.failed += 1;
      } else if (now.getTime() > deadline) {
        await markFailed(job.id, "Timed out waiting for the scraper engine.");
        result.failed += 1;
      }
    } catch (error) {
      // An unreachable engine is usually temporary (container restarting):
      // keep the job running and record why, until its deadline passes.
      const message = error instanceof Error ? error.message : String(error);
      if (now.getTime() > deadline) {
        await markFailed(job.id, message);
        result.failed += 1;
      } else {
        await db.update(scrapeJobs).set({ error: message }).where(eq(scrapeJobs.id, job.id));
      }
    }
  }

  return result;
}

async function markFailed(id: string, error: string): Promise<void> {
  await db.update(scrapeJobs).set({ status: "failed", error, finishedAt: new Date() }).where(eq(scrapeJobs.id, id));
}

/** See worker/tick.ts's startTickLoop for why this is exported. */
export function startScrapeLoop(): void {
  console.log(`Scrape poller started, checking every ${POLL_INTERVAL_MS / 1000}s`);
  const loop = async () => {
    try {
      const result = await runScrapePoll();
      if (result.completed > 0 || result.failed > 0) {
        console.log(`scrapes: completed=${result.completed} failed=${result.failed}`);
      }
    } catch (error) {
      console.error("scrape poll failed", error);
    } finally {
      setTimeout(loop, POLL_INTERVAL_MS);
    }
  };
  void loop();
}

if (require.main === module) {
  startScrapeLoop();
}
