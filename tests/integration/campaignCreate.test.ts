import { sql, eq } from "drizzle-orm";
import { db, queryClient } from "@/db/client";
import { campaignMailboxes, mailboxes } from "@/db/schema";
import { POST } from "@/app/api/outreach/campaigns/route";

describe("POST /api/outreach/campaigns (integration)", () => {
  beforeEach(async () => {
    await db.execute(
      sql`TRUNCATE TABLE messages, events, enrollments, sequence_steps, campaign_mailboxes, campaigns, mailboxes, contacts, suppressions RESTART IDENTITY CASCADE`,
    );
  });

  afterAll(async () => {
    await queryClient.end({ timeout: 5 });
  });

  it("creates a campaign with a multi-mailbox pool", async () => {
    const [mailboxA] = await db
      .insert(mailboxes)
      .values({ provider: "smtp", fromName: "A", fromEmail: "a@example.com", encryptedCredentials: "x", dailyCap: 50 })
      .returning();
    const [mailboxB] = await db
      .insert(mailboxes)
      .values({ provider: "smtp", fromName: "B", fromEmail: "b@example.com", encryptedCredentials: "x", dailyCap: 50 })
      .returning();

    const request = new Request("http://localhost/api/outreach/campaigns", {
      method: "POST",
      body: JSON.stringify({
        mailboxIds: [mailboxA.id, mailboxB.id],
        name: "Pool test",
        postalAddress: "123 Main St",
        steps: [{ subjectTemplate: "Hi", bodyTemplate: "Body", delayDays: 0 }],
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);
    const body = await response.json();

    const pool = await db.select().from(campaignMailboxes).where(eq(campaignMailboxes.campaignId, body.campaign.id));
    expect(pool.map((p) => p.mailboxId).sort()).toEqual([mailboxA.id, mailboxB.id].sort());
  });

  it("rejects a campaign with an empty mailbox pool", async () => {
    const request = new Request("http://localhost/api/outreach/campaigns", {
      method: "POST",
      body: JSON.stringify({
        mailboxIds: [],
        name: "No pool",
        postalAddress: "123 Main St",
        steps: [{ subjectTemplate: "Hi", bodyTemplate: "Body", delayDays: 0 }],
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
