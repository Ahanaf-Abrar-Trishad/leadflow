import { sql } from "drizzle-orm";
import { db, queryClient } from "@/db/client";
import { campaigns, campaignMailboxes, contacts, enrollments, mailboxes, messages, sequenceSteps } from "@/db/schema";
import { countSentByMailboxToday, countSentToDomainLast24h } from "@/lib/outreach/scheduler/sendCounts";

describe("send counts (integration)", () => {
  beforeEach(async () => {
    await db.execute(
      sql`TRUNCATE TABLE messages, events, enrollments, sequence_steps, campaign_mailboxes, campaigns, mailboxes, contacts, suppressions RESTART IDENTITY CASCADE`,
    );
  });

  afterAll(async () => {
    await queryClient.end({ timeout: 5 });
  });

  async function seedSentMessage(mailboxId: string, contactEmail: string, sentAt: Date) {
    const [campaign] = await db
      .insert(campaigns)
      .values({ name: "Test", postalAddress: "123 Main St", status: "active" })
      .returning();
    await db.insert(campaignMailboxes).values({ campaignId: campaign.id, mailboxId });
    await db.insert(sequenceSteps).values({ campaignId: campaign.id, stepOrder: 1, subjectTemplate: "Hi", bodyTemplate: "Body", delayDays: 0 });
    const [contact] = await db.insert(contacts).values({ email: contactEmail, fields: {} }).returning();
    const [enrollment] = await db
      .insert(enrollments)
      .values({ campaignId: campaign.id, contactId: contact.id, mailboxId, status: "active" })
      .returning();
    await db.insert(messages).values({ enrollmentId: enrollment.id, rfcMessageId: `<${crypto.randomUUID()}@test>`, status: "sent", sentAt });
  }

  it("counts messages sent by a mailbox within the last 24h, excluding older ones", async () => {
    const [mailbox] = await db
      .insert(mailboxes)
      .values({ provider: "smtp", fromName: "Jane", fromEmail: "jane@example.com", encryptedCredentials: "x", dailyCap: 50 })
      .returning();

    const now = new Date("2026-09-11T12:00:00Z");
    await seedSentMessage(mailbox.id, "a@acme.com", new Date("2026-09-11T06:00:00Z")); // within 24h
    await seedSentMessage(mailbox.id, "b@acme.com", new Date("2026-09-09T06:00:00Z")); // outside 24h

    expect(await countSentByMailboxToday(mailbox.id, now)).toBe(1);
  });

  it("counts messages sent to a specific recipient domain via a mailbox within the last 24h", async () => {
    const [mailbox] = await db
      .insert(mailboxes)
      .values({ provider: "smtp", fromName: "Jane", fromEmail: "jane@example.com", encryptedCredentials: "x", dailyCap: 50 })
      .returning();

    const now = new Date("2026-09-11T12:00:00Z");
    await seedSentMessage(mailbox.id, "a@acme.com", new Date("2026-09-11T06:00:00Z"));
    await seedSentMessage(mailbox.id, "b@acme.com", new Date("2026-09-11T07:00:00Z"));
    await seedSentMessage(mailbox.id, "c@beta.com", new Date("2026-09-11T08:00:00Z"));

    expect(await countSentToDomainLast24h(mailbox.id, "acme.com", now)).toBe(2);
    expect(await countSentToDomainLast24h(mailbox.id, "beta.com", now)).toBe(1);
  });

  it("does not count another mailbox's sends", async () => {
    const [mailboxA] = await db
      .insert(mailboxes)
      .values({ provider: "smtp", fromName: "A", fromEmail: "a@example.com", encryptedCredentials: "x", dailyCap: 50 })
      .returning();
    const [mailboxB] = await db
      .insert(mailboxes)
      .values({ provider: "smtp", fromName: "B", fromEmail: "b@example.com", encryptedCredentials: "x", dailyCap: 50 })
      .returning();

    const now = new Date("2026-09-11T12:00:00Z");
    await seedSentMessage(mailboxA.id, "x@acme.com", new Date("2026-09-11T06:00:00Z"));

    expect(await countSentByMailboxToday(mailboxB.id, now)).toBe(0);
  });
});
