import { sql } from "drizzle-orm";
import { db, queryClient } from "@/db/client";
import { campaigns, campaignMailboxes, contacts, enrollments, mailboxes, messages, sequenceSteps } from "@/db/schema";
import { getMailboxHealthRows, getCampaignPerformanceRows } from "@/lib/outreach/dashboard/queries";

describe("dashboard queries (integration)", () => {
  beforeEach(async () => {
    await db.execute(
      sql`TRUNCATE TABLE messages, events, enrollments, sequence_steps, campaign_mailboxes, campaigns, mailboxes, contacts, suppressions RESTART IDENTITY CASCADE`,
    );
  });

  afterAll(async () => {
    await queryClient.end({ timeout: 5 });
  });

  it("reports each mailbox's sends today and null bounce rate under the sample minimum", async () => {
    const [mailbox] = await db
      .insert(mailboxes)
      .values({ provider: "smtp", fromName: "Jane", fromEmail: "jane@example.com", encryptedCredentials: "x", dailyCap: 50, health: "healthy" })
      .returning();
    const [campaign] = await db.insert(campaigns).values({ name: "T", postalAddress: "123 Main St", status: "active" }).returning();
    await db.insert(campaignMailboxes).values({ campaignId: campaign.id, mailboxId: mailbox.id });
    const [contact] = await db.insert(contacts).values({ email: "a@example.com", fields: {} }).returning();
    const [enrollment] = await db
      .insert(enrollments)
      .values({ campaignId: campaign.id, contactId: contact.id, mailboxId: mailbox.id, status: "completed" })
      .returning();
    await db.insert(messages).values({ enrollmentId: enrollment.id, rfcMessageId: "<a@test>", status: "sent", sentAt: new Date() });

    const rows = await getMailboxHealthRows(new Date());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: mailbox.id, sentToday: 1, bounceRate: null });
  });

  it("reports each campaign's enrollment status breakdown and reply rate", async () => {
    const [mailbox] = await db
      .insert(mailboxes)
      .values({ provider: "smtp", fromName: "Jane", fromEmail: "jane@example.com", encryptedCredentials: "x", dailyCap: 50 })
      .returning();
    const [campaign] = await db.insert(campaigns).values({ name: "Perf test", postalAddress: "123 Main St", status: "active" }).returning();
    await db.insert(campaignMailboxes).values({ campaignId: campaign.id, mailboxId: mailbox.id });
    await db.insert(sequenceSteps).values({ campaignId: campaign.id, stepOrder: 1, subjectTemplate: "Hi", bodyTemplate: "Body", delayDays: 0 });

    const statuses = ["replied", "replied", "bounced", "completed", "active"];
    for (const [i, status] of statuses.entries()) {
      const [c] = await db.insert(contacts).values({ email: `c${i}@example.com`, fields: {} }).returning();
      await db.insert(enrollments).values({ campaignId: campaign.id, contactId: c.id, mailboxId: mailbox.id, status });
    }

    const rows = await getCampaignPerformanceRows();
    const row = rows.find((r) => r.id === campaign.id);
    expect(row).toMatchObject({ enrolled: 5, replied: 2, bounced: 1, completed: 1, active: 1, replyRate: 2 / 4 });
  });
});
