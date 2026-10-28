import { sql, eq } from "drizzle-orm";
import { db, queryClient } from "@/db/client";
import { campaigns, campaignMailboxes, mailboxes, sequenceSteps } from "@/db/schema";
import { PATCH } from "@/app/api/outreach/campaigns/[id]/route";

describe("PATCH /api/outreach/campaigns/[id] (integration)", () => {
  beforeEach(async () => {
    await db.execute(
      sql`TRUNCATE TABLE messages, events, enrollments, sequence_steps, campaign_mailboxes, campaigns, mailboxes, contacts, suppressions RESTART IDENTITY CASCADE`,
    );
  });

  afterAll(async () => {
    await queryClient.end({ timeout: 5 });
  });

  it("updates a draft campaign's fields, pool, and steps", async () => {
    const [mailboxA] = await db
      .insert(mailboxes)
      .values({ provider: "smtp", fromName: "A", fromEmail: "a@example.com", encryptedCredentials: "x", dailyCap: 50 })
      .returning();
    const [mailboxB] = await db
      .insert(mailboxes)
      .values({ provider: "smtp", fromName: "B", fromEmail: "b@example.com", encryptedCredentials: "x", dailyCap: 50 })
      .returning();
    const [campaign] = await db
      .insert(campaigns)
      .values({ name: "Old name", postalAddress: "Old address", status: "draft" })
      .returning();
    await db.insert(campaignMailboxes).values({ campaignId: campaign.id, mailboxId: mailboxA.id });
    await db.insert(sequenceSteps).values({ campaignId: campaign.id, stepOrder: 1, subjectTemplate: "Old subject", bodyTemplate: "Old body", delayDays: 0 });

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          mailboxIds: [mailboxB.id],
          name: "New name",
          postalAddress: "New address",
          steps: [{ subjectTemplate: "New subject", bodyTemplate: "New body", delayDays: 0 }],
          businessDays: [1, 2, 3, 4, 5],
          businessHoursStart: 8,
          businessHoursEnd: 18,
          baseIntervalSeconds: 90,
          domainThrottleLimit: 5,
        }),
      }),
      { params: Promise.resolve({ id: campaign.id }) },
    );

    expect(response.status).toBe(200);

    const [updated] = await db.select().from(campaigns).where(eq(campaigns.id, campaign.id));
    expect(updated).toMatchObject({
      name: "New name",
      postalAddress: "New address",
      businessHoursStart: 8,
      businessHoursEnd: 18,
      baseIntervalSeconds: 90,
      domainThrottleLimit: 5,
    });
    expect(updated.businessDays).toEqual([1, 2, 3, 4, 5]);

    const pool = await db.select().from(campaignMailboxes).where(eq(campaignMailboxes.campaignId, campaign.id));
    expect(pool.map((p) => p.mailboxId)).toEqual([mailboxB.id]);

    const steps = await db.select().from(sequenceSteps).where(eq(sequenceSteps.campaignId, campaign.id));
    expect(steps).toHaveLength(1);
    expect(steps[0].subjectTemplate).toBe("New subject");
  });

  it("rejects editing a campaign that isn't a draft", async () => {
    const [mailbox] = await db
      .insert(mailboxes)
      .values({ provider: "smtp", fromName: "A", fromEmail: "a@example.com", encryptedCredentials: "x", dailyCap: 50 })
      .returning();
    const [campaign] = await db
      .insert(campaigns)
      .values({ name: "Test", postalAddress: "123 Main St", status: "active" })
      .returning();

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          mailboxIds: [mailbox.id],
          name: "New name",
          postalAddress: "New address",
          steps: [{ subjectTemplate: "S", bodyTemplate: "B", delayDays: 0 }],
        }),
      }),
      { params: Promise.resolve({ id: campaign.id }) },
    );

    expect(response.status).toBe(409);
  });
});
