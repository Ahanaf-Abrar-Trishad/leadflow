import { sql, eq } from "drizzle-orm";
import { db, queryClient } from "@/db/client";
import { campaigns, campaignMailboxes, contacts, enrollments, mailboxes, messages, events, sequenceSteps, workerHeartbeats } from "@/db/schema";
import { encrypt, loadEncryptionKey } from "@/lib/outreach/crypto";
import { runTick } from "@/worker/tick";
import type { Transport } from "@/lib/outreach/transport/types";

// No real SMTP sink is available in this environment (no Docker/MailHog),
// so this test verifies everything the worker is responsible for *except*
// the actual network send: claiming, template rendering, the unsubscribe
// token, and the DB state transitions. The real SMTP path (nodemailer
// wiring) is unit-tested with a mocked transport in transport/smtp.test.ts;
// this fake plays the same role here against a real database.
function createFakeTransport(): Transport & { sentMessages: unknown[] } {
  const sentMessages: unknown[] = [];
  return {
    sentMessages,
    async verify() {},
    async send(message) {
      sentMessages.push(message);
      return { rfcMessageId: `<fake-${sentMessages.length}@test>` };
    },
  };
}

function createFakeGmailTransport(): Transport & { sentMessages: unknown[] } {
  const sentMessages: unknown[] = [];
  return {
    sentMessages,
    async verify() {},
    async send(message) {
      sentMessages.push(message);
      return { rfcMessageId: `<fake-gmail-${sentMessages.length}@test>`, providerThreadId: "fake-thread-id" };
    },
  };
}

describe("worker tick (integration)", () => {
  beforeEach(async () => {
    await db.execute(
      sql`TRUNCATE TABLE messages, events, enrollments, sequence_steps, campaign_mailboxes, campaigns, mailboxes, contacts, suppressions, worker_heartbeats RESTART IDENTITY CASCADE`,
    );
  });

  afterAll(async () => {
    await queryClient.end({ timeout: 5 });
  });

  it("records a heartbeat after ticking", async () => {
    const fakeTransport = createFakeTransport();
    const before = new Date();
    await runTick(new Date(), () => fakeTransport);

    const [heartbeat] = await db.select().from(workerHeartbeats).where(eq(workerHeartbeats.process, "worker"));
    expect(heartbeat).toBeDefined();
    expect(heartbeat.lastRunAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(heartbeat.lastResult).toMatchObject({ attempted: 0, sent: 0, failed: 0 });
  });

  it("sends a due enrollment and marks it completed", async () => {
    const key = loadEncryptionKey();
    const credentials = encrypt(
      JSON.stringify({ host: "localhost", port: 1025, secure: false, user: "", pass: "" }),
      key,
    );

    const [mailbox] = await db
      .insert(mailboxes)
      .values({
        provider: "smtp",
        fromName: "Jane",
        fromEmail: "jane@example.com",
        encryptedCredentials: credentials,
        dailyCap: 50,
      })
      .returning();

    const [campaign] = await db
      .insert(campaigns)
      .values({ name: "Test campaign", postalAddress: "123 Main St", status: "active" })
      .returning();
    await db.insert(campaignMailboxes).values({ campaignId: campaign.id, mailboxId: mailbox.id });
    await db.insert(sequenceSteps).values({
      campaignId: campaign.id,
      stepOrder: 1,
      subjectTemplate: "Hi {{first_name}}",
      bodyTemplate: "Hello {{first_name}}, this is a test. Unsubscribe: {{unsubscribe_token}}",
      delayDays: 0,
    });

    const [contact] = await db
      .insert(contacts)
      .values({ email: "recipient@example.com", fields: { first_name: "Alex" } })
      .returning();

    const [enrollment] = await db
      .insert(enrollments)
      .values({
        campaignId: campaign.id,
        contactId: contact.id,
        mailboxId: mailbox.id,
        status: "active",
        nextSendAt: new Date(Date.now() - 1000),
      })
      .returning();

    const fakeTransport = createFakeTransport();
    const result = await runTick(new Date(), () => fakeTransport);

    expect(result).toEqual({ attempted: 1, sent: 1, failed: 0 });
    expect(fakeTransport.sentMessages).toHaveLength(1);
    expect(fakeTransport.sentMessages[0]).toMatchObject({
      to: "recipient@example.com",
      subject: "Hi Alex",
      text: expect.stringContaining("Hello Alex"),
    });
    // No tracking pixel or bulk headers - just the rendered plain text.
    expect((fakeTransport.sentMessages[0] as { text: string }).text).not.toMatch(/<img/i);

    const [updatedEnrollment] = await db.select().from(enrollments).where(eq(enrollments.id, enrollment.id));
    expect(updatedEnrollment.status).toBe("completed");
    expect(updatedEnrollment.sentAt).not.toBeNull();

    const sentMessageRows = await db.select().from(messages).where(eq(messages.enrollmentId, enrollment.id));
    expect(sentMessageRows).toHaveLength(1);

    const messageSentEvents = await db.select().from(events).where(eq(events.type, "message_sent"));
    expect(messageSentEvents).toHaveLength(1);
  });

  it("does nothing when there is nothing due", async () => {
    const fakeTransport = createFakeTransport();
    expect(await runTick(new Date(), () => fakeTransport)).toEqual({ attempted: 0, sent: 0, failed: 0 });
  });

  it("sends at most one message per mailbox per tick, even with two due enrollments", async () => {
    const key = loadEncryptionKey();
    const credentials = encrypt(
      JSON.stringify({ host: "localhost", port: 1025, secure: false, user: "", pass: "" }),
      key,
    );

    const [mailbox] = await db
      .insert(mailboxes)
      .values({ provider: "smtp", fromName: "Jane", fromEmail: "jane@example.com", encryptedCredentials: credentials, dailyCap: 50 })
      .returning();

    const [campaign] = await db
      .insert(campaigns)
      .values({ name: "Test campaign", postalAddress: "123 Main St", status: "active" })
      .returning();
    await db.insert(campaignMailboxes).values({ campaignId: campaign.id, mailboxId: mailbox.id });
    await db.insert(sequenceSteps).values({
      campaignId: campaign.id,
      stepOrder: 1,
      subjectTemplate: "Hi {{first_name}}",
      bodyTemplate: "Hello {{first_name}}",
      delayDays: 0,
    });

    const [contactA] = await db.insert(contacts).values({ email: "a@example.com", fields: { first_name: "A" } }).returning();
    const [contactB] = await db.insert(contacts).values({ email: "b@example.com", fields: { first_name: "B" } }).returning();

    await db.insert(enrollments).values([
      { campaignId: campaign.id, contactId: contactA.id, mailboxId: mailbox.id, status: "active", nextSendAt: new Date(Date.now() - 2000) },
      { campaignId: campaign.id, contactId: contactB.id, mailboxId: mailbox.id, status: "active", nextSendAt: new Date(Date.now() - 1000) },
    ]);

    const fakeTransport = createFakeTransport();
    const result = await runTick(new Date(), () => fakeTransport);

    expect(result).toEqual({ attempted: 1, sent: 1, failed: 0 });
    expect(fakeTransport.sentMessages).toHaveLength(1);

    const remainingActive = await db
      .select()
      .from(enrollments)
      .where(eq(enrollments.campaignId, campaign.id));
    const stillActive = remainingActive.filter((e) => e.status === "active");
    expect(stillActive).toHaveLength(1); // the un-claimed one waits for the next tick
  });

  it("schedules the next step instead of completing when one exists", async () => {
    const key = loadEncryptionKey();
    const credentials = encrypt(
      JSON.stringify({ host: "localhost", port: 1025, secure: false, user: "", pass: "" }),
      key,
    );

    const [mailbox] = await db
      .insert(mailboxes)
      .values({ provider: "smtp", fromName: "Jane", fromEmail: "jane@example.com", encryptedCredentials: credentials, dailyCap: 50 })
      .returning();

    const [campaign] = await db
      .insert(campaigns)
      .values({ name: "Two-step", postalAddress: "123 Main St", status: "active" })
      .returning();
    await db.insert(campaignMailboxes).values({ campaignId: campaign.id, mailboxId: mailbox.id });

    await db.insert(sequenceSteps).values([
      { campaignId: campaign.id, stepOrder: 1, subjectTemplate: "Hi {{first_name}}", bodyTemplate: "Step one", delayDays: 0 },
      { campaignId: campaign.id, stepOrder: 2, subjectTemplate: "Following up", bodyTemplate: "Step two", delayDays: 2 },
    ]);

    const [contact] = await db.insert(contacts).values({ email: "recipient@example.com", fields: { first_name: "Alex" } }).returning();

    const [enrollment] = await db
      .insert(enrollments)
      .values({ campaignId: campaign.id, contactId: contact.id, mailboxId: mailbox.id, status: "active", currentStep: 1, nextSendAt: new Date(Date.now() - 1000) })
      .returning();

    const fakeTransport = createFakeTransport();
    const result = await runTick(new Date(), () => fakeTransport);
    expect(result).toEqual({ attempted: 1, sent: 1, failed: 0 });

    const [updated] = await db.select().from(enrollments).where(eq(enrollments.id, enrollment.id));
    expect(updated.status).toBe("active");
    expect(updated.currentStep).toBe(2);
    expect(updated.nextSendAt).not.toBeNull();
    expect(updated.nextSendAt!.getTime()).toBeGreaterThan(Date.now() + 24 * 60 * 60 * 1000); // roughly 2 days out
  });

  it("dispatches to the Gmail transport for a gmail_oauth mailbox, passing providerThreadId through", async () => {
    const key = loadEncryptionKey();
    const credentials = encrypt(JSON.stringify({ oauth: { refreshToken: "1//test", email: "jane@gmail.com" } }), key);

    const [mailbox] = await db
      .insert(mailboxes)
      .values({ provider: "gmail_oauth", fromName: "Jane", fromEmail: "jane@gmail.com", encryptedCredentials: credentials, dailyCap: 50 })
      .returning();

    const [campaign] = await db
      .insert(campaigns)
      .values({ name: "Gmail test", postalAddress: "123 Main St", status: "active" })
      .returning();
    await db.insert(campaignMailboxes).values({ campaignId: campaign.id, mailboxId: mailbox.id });
    await db.insert(sequenceSteps).values({
      campaignId: campaign.id,
      stepOrder: 1,
      subjectTemplate: "Hi {{first_name}}",
      bodyTemplate: "Hello {{first_name}}",
      delayDays: 0,
    });

    const [contact] = await db.insert(contacts).values({ email: "recipient@example.com", fields: { first_name: "Alex" } }).returning();
    const [enrollment] = await db
      .insert(enrollments)
      .values({ campaignId: campaign.id, contactId: contact.id, mailboxId: mailbox.id, status: "active", nextSendAt: new Date(Date.now() - 1000) })
      .returning();

    const fakeSmtp = createFakeTransport();
    const fakeGmail = createFakeGmailTransport();
    const result = await runTick(new Date(), () => fakeSmtp, () => fakeGmail);

    expect(result).toEqual({ attempted: 1, sent: 1, failed: 0 });
    expect(fakeSmtp.sentMessages).toHaveLength(0); // SMTP path never touched
    expect(fakeGmail.sentMessages).toHaveLength(1);

    const sentMessageRows = await db.select().from(messages).where(eq(messages.enrollmentId, enrollment.id));
    expect(sentMessageRows).toHaveLength(1);
    expect(sentMessageRows[0].providerThreadId).toBe("fake-thread-id");
  });

  it("does not double-send when two ticks race on the same due enrollment", async () => {
    // Regression test: production ran two worker processes concurrently
    // (one launched via instrumentation.ts in-process, one as a leftover
    // standalone `npm run worker`) and every send went out twice - both
    // processes' runTick() read the same due enrollment via the plain
    // SELECT claim query before either had recorded a message for it.
    const key = loadEncryptionKey();
    const credentials = encrypt(
      JSON.stringify({ host: "localhost", port: 1025, secure: false, user: "", pass: "" }),
      key,
    );

    const [mailbox] = await db
      .insert(mailboxes)
      .values({ provider: "smtp", fromName: "Jane", fromEmail: "jane@example.com", encryptedCredentials: credentials, dailyCap: 50 })
      .returning();

    const [campaign] = await db
      .insert(campaigns)
      .values({ name: "Race condition test", postalAddress: "123 Main St", status: "active" })
      .returning();
    await db.insert(campaignMailboxes).values({ campaignId: campaign.id, mailboxId: mailbox.id });
    await db.insert(sequenceSteps).values({
      campaignId: campaign.id,
      stepOrder: 1,
      subjectTemplate: "Hi {{first_name}}",
      bodyTemplate: "Hello {{first_name}}",
      delayDays: 0,
    });

    const [contact] = await db.insert(contacts).values({ email: "recipient@example.com", fields: { first_name: "Alex" } }).returning();

    const [enrollment] = await db
      .insert(enrollments)
      .values({ campaignId: campaign.id, contactId: contact.id, mailboxId: mailbox.id, status: "active", nextSendAt: new Date(Date.now() - 1000) })
      .returning();

    const fakeTransport = createFakeTransport();
    const now = new Date();
    const [resultA, resultB] = await Promise.all([runTick(now, () => fakeTransport), runTick(now, () => fakeTransport)]);
    const totalSent = resultA.sent + resultB.sent;

    expect(totalSent).toBe(1);
    expect(fakeTransport.sentMessages).toHaveLength(1);

    const sentMessageRows = await db.select().from(messages).where(eq(messages.enrollmentId, enrollment.id));
    expect(sentMessageRows).toHaveLength(1);
  });

  it("does not claim an enrollment whose assigned mailbox is paused", async () => {
    const key = loadEncryptionKey();
    const credentials = encrypt(JSON.stringify({ host: "localhost", port: 1025, secure: false, user: "", pass: "" }), key);

    const [mailbox] = await db
      .insert(mailboxes)
      .values({ provider: "smtp", fromName: "Jane", fromEmail: "jane@example.com", encryptedCredentials: credentials, dailyCap: 50, health: "paused" })
      .returning();

    const [campaign] = await db
      .insert(campaigns)
      .values({ name: "Paused mailbox test", postalAddress: "123 Main St", status: "active" })
      .returning();
    await db.insert(campaignMailboxes).values({ campaignId: campaign.id, mailboxId: mailbox.id });
    await db.insert(sequenceSteps).values({ campaignId: campaign.id, stepOrder: 1, subjectTemplate: "Hi", bodyTemplate: "Body", delayDays: 0 });
    const [contact] = await db.insert(contacts).values({ email: "recipient@example.com", fields: {} }).returning();
    await db.insert(enrollments).values({
      campaignId: campaign.id,
      contactId: contact.id,
      mailboxId: mailbox.id,
      status: "active",
      nextSendAt: new Date(Date.now() - 1000),
    });

    const fakeTransport = createFakeTransport();
    const result = await runTick(new Date(), () => fakeTransport);

    expect(result).toEqual({ attempted: 0, sent: 0, failed: 0 });
    expect(fakeTransport.sentMessages).toHaveLength(0);
  });
});
