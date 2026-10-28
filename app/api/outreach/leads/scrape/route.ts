import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { scrapeJobs } from "@/db/schema";
import { GmapsClient } from "@/lib/leads/gmaps/client";
import { geocode } from "@/lib/leads/geocode";

const startScrapeSchema = z.object({
  keyword: z.string().trim().min(2).max(200),
  location: z.string().trim().min(2).max(200),
  depth: z.number().int().min(1).max(20).default(5),
  collectEmails: z.boolean().default(true),
});

/** Seconds the engine may spend: deeper scrolling and website visits for
 * emails both take longer. Bounded so a stuck job is noticed. */
function maxTimeFor(depth: number, collectEmails: boolean): number {
  return Math.min(Math.max(depth * 60 + (collectEmails ? 180 : 0), 240), 1800);
}

export async function POST(request: Request) {
  const parsed = startScrapeSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: z.flattenError(parsed.error) }, { status: 400 });
  }
  const { keyword, location, depth, collectEmails } = parsed.data;

  // One job at a time: parallel scrapes from one IP are what gets it
  // rate-limited by Google.
  const [running] = await db.select({ id: scrapeJobs.id }).from(scrapeJobs).where(eq(scrapeJobs.status, "running")).limit(1);
  if (running) {
    return NextResponse.json({ error: "A scrape is already running. Wait for it to finish first." }, { status: 409 });
  }

  let coordinates;
  try {
    coordinates = await geocode(location);
  } catch {
    return NextResponse.json({ error: "Could not look up that location right now. Try again." }, { status: 502 });
  }
  if (!coordinates) {
    return NextResponse.json({ error: `Could not find "${location}". Try "City, ST".` }, { status: 422 });
  }

  // Bake the place into the search term, as Maps itself expects.
  const searchTerm = keyword.toLowerCase().includes(location.toLowerCase()) ? keyword : `${keyword} in ${location}`;
  const maxTimeSeconds = maxTimeFor(depth, collectEmails);

  let externalJobId: string;
  try {
    externalJobId = await new GmapsClient().createJob({
      keyword: searchTerm,
      lat: coordinates.lat,
      lon: coordinates.lon,
      depth,
      collectEmails,
      maxTimeSeconds,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json(
      { error: `The Google Maps scraper is not reachable (${message}). Is the gmaps-scraper container running?` },
      { status: 502 },
    );
  }

  const [job] = await db
    .insert(scrapeJobs)
    .values({ keyword: searchTerm, location, depth, collectEmails, maxTimeSeconds, externalJobId })
    .returning();

  return NextResponse.json({ job }, { status: 201 });
}
