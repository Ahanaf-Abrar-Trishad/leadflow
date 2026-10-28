import { sql, eq } from "drizzle-orm";
import { db, queryClient } from "@/db/client";
import { campaigns, contacts, enrollments, leads, scrapeJobs, suppressions } from "@/db/schema";
import { upsertLeads } from "@/lib/leads/upsert";
import { runScrapePoll } from "@/worker/scrapes";
import { POST as importLeads } from "@/app/api/outreach/leads/import/route";
import { POST as enrollLeads } from "@/app/api/outreach/leads/enroll/route";
import { POST as setLeadStatus } from "@/app/api/outreach/leads/status/route";
import { POST as startScrape } from "@/app/api/outreach/leads/scrape/route";

function jsonRequest(body: unknown) {
  return new Request("http://localhost", { method: "POST", body: JSON.stringify(body) });
}

describe("leads (integration)", () => {
  beforeEach(async () => {
    await db.execute(
      sql`TRUNCATE TABLE leads, scrape_jobs, messages, events, enrollments, sequence_steps, campaign_mailboxes, campaigns, mailboxes, contacts, suppressions RESTART IDENTITY CASCADE`,
    );
  });

  afterAll(async () => {
    await queryClient.end({ timeout: 5 });
  });

  describe("upsertLeads", () => {
    it("merges a second sighting of the same business, filling gaps but never overwriting", async () => {
      await upsertLeads([{ name: "Acme Dental", website: "https://acmedental.com", phone: "111" }], { source: "gmaps" });
      const second = await upsertLeads(
        [{ name: "Acme Dental LLC", website: "https://www.acmedental.com/contact", phone: "999", email: "hi@acmedental.com" }],
        { source: "csv" },
      );

      expect(second).toMatchObject({ added: 0, updated: 1 });
      const rows = await db.select().from(leads);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ name: "Acme Dental", phone: "111", email: "hi@acmedental.com", source: "gmaps" });
      // Rescored from the merged row: email + phone + website.
      expect(rows[0].score).toBe(70);
    });

    it("collapses duplicates inside one batch", async () => {
      const result = await upsertLeads(
        [
          { name: "Bright Smile", website: "https://brightsmile.com" },
          { name: "Bright Smile (2nd location)", website: "https://brightsmile.com/austin", email: "a@brightsmile.com" },
        ],
        { source: "gmaps" },
      );
      expect(result).toMatchObject({ added: 1, updated: 0 });
      const [row] = await db.select().from(leads);
      expect(row).toMatchObject({ name: "Bright Smile", email: "a@brightsmile.com" });
    });
  });

  describe("POST /api/outreach/leads/import", () => {
    it("detects a Scout export and stores its rows as scout leads", async () => {
      const response = await importLeads(
        jsonRequest({
          headers: ["platform", "username", "full_name", "email", "profile_url"],
          rows: [
            { platform: "instagram", username: "glow", full_name: "Glow Studio", email: "book@glow.co", profile_url: "https://instagram.com/glow" },
            { platform: "instagram", username: "ghost", full_name: "No Contact" },
          ],
        }),
      );
      expect(await response.json()).toMatchObject({ format: "scout", added: 1, merged: 0, skipped: 1 });
      const [row] = await db.select().from(leads);
      expect(row).toMatchObject({ source: "scout", platform: "instagram", email: "book@glow.co" });
    });
  });

  describe("POST /api/outreach/leads/enroll", () => {
    it("turns leads into contacts with merge fields and timezone, and skips leads without email or suppressed", async () => {
      const [campaign] = await db.insert(campaigns).values({ name: "Dentists", postalAddress: "1 Main St", status: "draft" }).returning();
      await db.insert(suppressions).values({ email: "stop@blocked.com", reason: "unsubscribe" });
      const { ids } = await upsertLeads(
        [
          { name: "Acme Dental", email: "front@acmedental.com", website: "https://acmedental.com", timezone: "America/Chicago", rating: 4.1, reviewCount: 30 },
          { name: "No Email Co", phone: "555", externalId: "p2" },
          { name: "Blocked Co", email: "stop@blocked.com" },
        ],
        { source: "gmaps" },
      );

      const response = await enrollLeads(jsonRequest({ campaignId: campaign.id, leadIds: ids }));
      expect(await response.json()).toMatchObject({ enrolled: 1, skippedNoEmail: 1, skippedSuppressed: 1 });

      const [contact] = await db.select().from(contacts).where(eq(contacts.email, "front@acmedental.com"));
      expect(contact.timezone).toBe("America/Chicago");
      expect(contact.source).toBe("lead:gmaps");
      expect(contact.fields).toMatchObject({ company: "Acme Dental", greeting: "there", domain: "acmedental.com", rating: "4.1" });
      expect(contact.fields.first_name).toBeUndefined();

      const enrolled = await db.select().from(enrollments).where(eq(enrollments.campaignId, campaign.id));
      expect(enrolled).toHaveLength(1);
      const [lead] = await db.select().from(leads).where(eq(leads.email, "front@acmedental.com"));
      expect(lead).toMatchObject({ status: "in_campaign", contactId: contact.id });
    });

    it("refuses a completed campaign", async () => {
      const [campaign] = await db.insert(campaigns).values({ name: "Old", postalAddress: "1 Main St", status: "completed" }).returning();
      const { ids } = await upsertLeads([{ name: "A", email: "a@a.com" }], { source: "csv" });
      const response = await enrollLeads(jsonRequest({ campaignId: campaign.id, leadIds: ids }));
      expect(response.status).toBe(409);
    });
  });

  describe("POST /api/outreach/leads/status", () => {
    it("disqualifies new leads but leaves leads already in a campaign alone", async () => {
      const { ids } = await upsertLeads(
        [
          { name: "A", email: "a@a.com" },
          { name: "B", email: "b@b.com" },
        ],
        { source: "csv" },
      );
      await db.update(leads).set({ status: "in_campaign" }).where(eq(leads.id, ids[1]));

      const response = await setLeadStatus(jsonRequest({ leadIds: ids, status: "disqualified" }));
      expect(await response.json()).toEqual({ updated: 1 });
      const rows = await db.select().from(leads);
      expect(rows.map((row) => row.status).sort()).toEqual(["disqualified", "in_campaign"]);
    });
  });

  describe("POST /api/outreach/leads/scrape", () => {
    it("refuses to start a second scrape while one is running", async () => {
      await db.insert(scrapeJobs).values({ keyword: "dentists in Austin", location: "Austin", depth: 5, maxTimeSeconds: 600, externalJobId: "x" });
      const response = await startScrape(jsonRequest({ keyword: "roofers", location: "Dallas, TX" }));
      expect(response.status).toBe(409);
    });
  });

  describe("runScrapePoll", () => {
    const csv = [
      "title,category,address,website,phone,review_count,review_rating,timezone,place_id,emails",
      "Acme Dental,Dentist,1 Main St,acmedental.com,+1 512-555-0101,87,4.1,America/Chicago,p1,front@acmedental.com",
      "Bright Smile,Dentist,2 Main St,brightsmile.com,+1 512-555-0102,12,4.8,America/Chicago,p2,",
    ].join("\n");

    it("imports a finished job, finds missing emails on the website, and cleans up the engine job", async () => {
      const [job] = await db
        .insert(scrapeJobs)
        .values({ keyword: "dentists in Austin", location: "Austin", depth: 5, maxTimeSeconds: 600, externalJobId: "engine-1" })
        .returning();
      const deleteJob = jest.fn(async () => undefined);
      const findEmail = jest.fn(async (website: string) => (website.includes("brightsmile") ? "hello@brightsmile.com" : undefined));

      const result = await runScrapePoll({
        client: { getStatus: async () => "ok", downloadCsv: async () => csv, deleteJob },
        findEmail,
      });

      expect(result).toEqual({ checked: 1, completed: 1, failed: 0 });
      const [updated] = await db.select().from(scrapeJobs).where(eq(scrapeJobs.id, job.id));
      expect(updated).toMatchObject({ status: "done", leadsFound: 2, leadsAdded: 2 });
      expect(deleteJob).toHaveBeenCalledWith("engine-1");
      // Only the lead without an email was looked up.
      expect(findEmail).toHaveBeenCalledTimes(1);

      const [bright] = await db.select().from(leads).where(eq(leads.name, "Bright Smile"));
      expect(bright).toMatchObject({ email: "hello@brightsmile.com", emailSource: "website", scrapeJobId: job.id });
      expect(bright.score).toBe(80);
    });

    it("marks a job failed when the engine reports failure, and times out a job stuck past its deadline", async () => {
      const longAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      await db.insert(scrapeJobs).values([
        { keyword: "a", location: "x", depth: 1, maxTimeSeconds: 300, externalJobId: "failed-job" },
        { keyword: "b", location: "x", depth: 1, maxTimeSeconds: 300, externalJobId: "stuck-job", createdAt: longAgo },
      ]);

      const result = await runScrapePoll({
        client: {
          getStatus: async (id: string) => (id === "failed-job" ? "failed" : "working"),
          downloadCsv: async () => "",
          deleteJob: async () => undefined,
        },
        findEmail: async () => undefined,
      });

      expect(result).toEqual({ checked: 2, completed: 0, failed: 2 });
      const rows = await db.select().from(scrapeJobs);
      expect(rows.every((row) => row.status === "failed" && row.error)).toBe(true);
    });

    it("keeps a job running when the engine is briefly unreachable", async () => {
      await db.insert(scrapeJobs).values({ keyword: "a", location: "x", depth: 1, maxTimeSeconds: 300, externalJobId: "j" });
      await runScrapePoll({
        client: {
          getStatus: async () => {
            throw new Error("connect ECONNREFUSED");
          },
          downloadCsv: async () => "",
          deleteJob: async () => undefined,
        },
        findEmail: async () => undefined,
      });
      const [row] = await db.select().from(scrapeJobs);
      expect(row).toMatchObject({ status: "running", error: "connect ECONNREFUSED" });
    });
  });
});
