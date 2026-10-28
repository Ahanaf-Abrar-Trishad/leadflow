import { sql, eq } from "drizzle-orm";
import { db, queryClient } from "@/db/client";
import { campaigns, campaignMailboxes, contacts, enrollments, events, mailboxes, messages, replies, sequenceSteps, suppressions, workerHeartbeats } from "@/db/schema";
import { encrypt, loadEncryptionKey } from "@/lib/outreach/crypto";
import { runPoll } from "@/worker/poller";
import type { ImapClient } from "@/lib/outreach/transport/imap";
import type { GmailPollClient } from "@/lib/outreach/transport/gmailPoll";

function fakeImapClient(messages: { from: string; source: string }[]): ImapClient {
  return {
    async verify() {},
    async fetchSince() {
      return messages;
    },
  };
}

function fakeGmailPollClient(messages: { from: string; source: string }[]): GmailPollClient {
  return {
    async verify() {},
    async fetchNew() {
      return { messages, newHistoryId: "9999" };
    },
  };
}

describe("poller (integration)", () => {
  beforeEach(async () => {
    await db.execute(
      sql`TRUNCATE TABLE replies, messages, events, enrollments, sequence_steps, campaign_mailboxes, campaigns, mailboxes, contacts, suppressions, worker_heartbeats RESTART IDENTITY CASCADE`,
    );
  });

  afterAll(async () => {
    await queryClient.end({ timeout: 5 });
  });

  async function makeActiveEnrollment(contactEmail: string) {
    const key = loadEncryptionKey();
    const credentials = encrypt(
      JSON.stringify({
        smtp: { host: "localhost", port: 1025, secure: false, user: "", pass: "" },
        imap: { host: "imap.example.com", port: 993, secure: true, user: "u", pass: "p" },
      }),
      key,
    );
    const [mailbox] = await db
      .insert(mailboxes)
      .values({ provider: "smtp", fromName: "Jane", fromEmail: "jane@example.com", encryptedCredentials: credentials, dailyCap: 50 })
      .returning();
    const [campaign] = await db
      .insert(campaigns)
      .values({ name: "Test", postalAddress: "123 Main St", status: "active" })
      .returning();
    await db.insert(campaignMailboxes).values({ campaignId: campaign.id, mailboxId: mailbox.id });
    await db.insert(sequenceSteps).values({ campaignId: campaign.id, stepOrder: 1, subjectTemplate: "Hi", bodyTemplate: "Body", delayDays: 0 });
    const [contact] = await db.insert(contacts).values({ email: contactEmail, fields: {} }).returning();
    const [enrollment] = await db
      .insert(enrollments)
      .values({ campaignId: campaign.id, contactId: contact.id, mailboxId: mailbox.id, status: "active", currentStep: 1, nextSendAt: new Date() })
      .returning();
    return { mailbox, campaign, contact, enrollment };
  }

  it("marks an enrollment replied when its contact's address appears in the inbox", async () => {
    const { enrollment } = await makeActiveEnrollment("recipient@example.com");

    const result = await runPoll(new Date(), () =>
      fakeImapClient([{ from: "recipient@example.com", source: "Subject: Re: hi\n\nSure, let's talk." }]),
    );

    expect(result).toEqual({ mailboxesPolled: 1, replied: 1, bounced: 0 });
    const [updated] = await db.select().from(enrollments).where(eq(enrollments.id, enrollment.id));
    expect(updated.status).toBe("replied");
    expect(updated.nextSendAt).toBeNull();

    const [reply] = await db.select().from(replies).where(eq(replies.enrollmentId, enrollment.id));
    expect(reply).toBeDefined();
    expect(reply.subject).toBe("Re: hi");
    expect(reply.snippet).toBe("Sure, let's talk.");
    expect(reply.fromAddress).toBe("recipient@example.com");
    expect(reply.status).toBe("unhandled");
    expect(reply.unsubscribeRequested).toBe(false);
  });

  it("suppresses and marks bounced on a hard-bounce DSN mentioning the contact", async () => {
    const { enrollment, contact } = await makeActiveEnrollment("bouncy@example.com");

    const dsnSource = [
      "From: mailer-daemon@relay.example.com",
      "Content-Type: multipart/report; report-type=delivery-status",
      "",
      "Status: 5.1.1",
      "Original-Recipient: rfc822;bouncy@example.com",
    ].join("\n");

    const result = await runPoll(new Date(), () =>
      fakeImapClient([{ from: "mailer-daemon@relay.example.com", source: dsnSource }]),
    );

    expect(result).toEqual({ mailboxesPolled: 1, replied: 0, bounced: 1 });
    const [updated] = await db.select().from(enrollments).where(eq(enrollments.id, enrollment.id));
    expect(updated.status).toBe("bounced");
    const suppressed = await db.select().from(suppressions).where(eq(suppressions.email, contact.email));
    expect(suppressed).toHaveLength(1);
    const reply = await db.select().from(replies).where(eq(replies.enrollmentId, enrollment.id));
    expect(reply).toHaveLength(0);
  });

  it("ignores a soft-bounce DSN (4.x.x) - no status change, no suppression", async () => {
    const { enrollment, contact } = await makeActiveEnrollment("softbounce@example.com");

    const dsnSource = [
      "From: mailer-daemon@relay.example.com",
      "Content-Type: multipart/report; report-type=delivery-status",
      "",
      "Status: 4.2.2",
      "Original-Recipient: rfc822;softbounce@example.com",
    ].join("\n");

    const result = await runPoll(new Date(), () =>
      fakeImapClient([{ from: "mailer-daemon@relay.example.com", source: dsnSource }]),
    );

    expect(result).toEqual({ mailboxesPolled: 1, replied: 0, bounced: 0 });
    const [updated] = await db.select().from(enrollments).where(eq(enrollments.id, enrollment.id));
    expect(updated.status).toBe("active");
    const suppressed = await db.select().from(suppressions).where(eq(suppressions.email, contact.email));
    expect(suppressed).toHaveLength(0);
  });

  it("skips a mailbox that has no IMAP credentials yet (connected before Phase 2)", async () => {
    const key = loadEncryptionKey();
    const oldShapeCredentials = encrypt(
      JSON.stringify({ host: "localhost", port: 1025, secure: false, user: "", pass: "" }),
      key,
    );
    const [mailbox] = await db
      .insert(mailboxes)
      .values({ provider: "smtp", fromName: "Jane", fromEmail: "jane@example.com", encryptedCredentials: oldShapeCredentials, dailyCap: 50 })
      .returning();
    const [campaign] = await db
      .insert(campaigns)
      .values({ name: "Test", postalAddress: "123 Main St", status: "active" })
      .returning();
    await db.insert(campaignMailboxes).values({ campaignId: campaign.id, mailboxId: mailbox.id });
    await db.insert(sequenceSteps).values({ campaignId: campaign.id, stepOrder: 1, subjectTemplate: "Hi", bodyTemplate: "Body", delayDays: 0 });
    const [contact] = await db.insert(contacts).values({ email: "someone@example.com", fields: {} }).returning();
    await db.insert(enrollments).values({ campaignId: campaign.id, contactId: contact.id, mailboxId: mailbox.id, status: "active", currentStep: 1, nextSendAt: new Date() });

    const result = await runPoll(new Date(), () => fakeImapClient([]));
    expect(result).toEqual({ mailboxesPolled: 0, replied: 0, bounced: 0 });
  });

  it("dispatches Gmail-provider mailboxes through history.list instead of IMAP", async () => {
    const key = loadEncryptionKey();
    const credentials = encrypt(JSON.stringify({ oauth: { refreshToken: "1//test", email: "jane@gmail.com" } }), key);

    const [mailbox] = await db
      .insert(mailboxes)
      .values({ provider: "gmail_oauth", fromName: "Jane", fromEmail: "jane@gmail.com", encryptedCredentials: credentials, dailyCap: 50 })
      .returning();
    const [campaign] = await db
      .insert(campaigns)
      .values({ name: "Test", postalAddress: "123 Main St", status: "active" })
      .returning();
    await db.insert(campaignMailboxes).values({ campaignId: campaign.id, mailboxId: mailbox.id });
    await db.insert(sequenceSteps).values({ campaignId: campaign.id, stepOrder: 1, subjectTemplate: "Hi", bodyTemplate: "Body", delayDays: 0 });
    const [contact] = await db.insert(contacts).values({ email: "recipient@example.com", fields: {} }).returning();
    const [enrollment] = await db
      .insert(enrollments)
      .values({ campaignId: campaign.id, contactId: contact.id, mailboxId: mailbox.id, status: "active", currentStep: 1, nextSendAt: new Date() })
      .returning();

    const result = await runPoll(
      new Date(),
      () => fakeImapClient([]),
      () => fakeGmailPollClient([{ from: "recipient@example.com", source: "Subject: Re: hi\n\nSure." }]),
    );

    expect(result).toEqual({ mailboxesPolled: 1, replied: 1, bounced: 0 });
    const [updated] = await db.select().from(enrollments).where(eq(enrollments.id, enrollment.id));
    expect(updated.status).toBe("replied");

    const [reply] = await db.select().from(replies).where(eq(replies.enrollmentId, enrollment.id));
    expect(reply).toBeDefined();
    expect(reply.mailboxId).toBe(mailbox.id);

    const [updatedMailbox] = await db.select().from(mailboxes).where(eq(mailboxes.id, mailbox.id));
    expect(updatedMailbox.lastHistoryId).toBe("9999");
  });

  it("pauses a mailbox once its trailing hard-bounce rate crosses 3% over at least 20 sends", async () => {
    const { mailbox, campaign, enrollment } = await makeActiveEnrollment("bouncy@example.com");
    // makeActiveEnrollment creates the enrollment but no `messages` row -
    // the circuit breaker's trailing window is joined through `messages`,
    // so this enrollment needs one too or it's invisible to that query.
    await db.insert(messages).values({ enrollmentId: enrollment.id, rfcMessageId: "<helper@test>", status: "sent", sentAt: new Date() });
    // Build 19 more sent+bounced/completed enrollments against the same
    // mailbox so the trailing window has 20 samples at exactly 3 bounced
    // (15%, comfortably over the 3% threshold).
    for (let i = 0; i < 19; i++) {
      const [c] = await db.insert(contacts).values({ email: `filler${i}@example.com`, fields: {} }).returning();
      const status = i < 2 ? "bounced" : "completed"; // 2 more bounced + the DSN below = 3 of 20
      const [e] = await db
        .insert(enrollments)
        .values({ campaignId: campaign.id, contactId: c.id, mailboxId: mailbox.id, status, currentStep: 1 })
        .returning();
      await db.insert(messages).values({ enrollmentId: e.id, rfcMessageId: `<${i}@test>`, status: "sent", sentAt: new Date() });
    }

    const dsnSource = [
      "From: mailer-daemon@relay.example.com",
      "Content-Type: multipart/report; report-type=delivery-status",
      "",
      "Status: 5.1.1",
      "Original-Recipient: rfc822;bouncy@example.com",
    ].join("\n");

    await runPoll(new Date(), () => fakeImapClient([{ from: "mailer-daemon@relay.example.com", source: dsnSource }]));

    const [updatedMailbox] = await db.select().from(mailboxes).where(eq(mailboxes.id, mailbox.id));
    expect(updatedMailbox.health).toBe("paused");

    const pauseEvents = await db.select().from(events).where(eq(events.type, "mailbox_paused"));
    expect(pauseEvents).toHaveLength(1);
    expect(pauseEvents[0].payload).toMatchObject({ mailboxId: mailbox.id, sampleSize: 20 });
  });

  it("does not pause a mailbox under the 20-sample minimum, even at a high bounce rate", async () => {
    const { mailbox, contact } = await makeActiveEnrollment("bouncy2@example.com");

    const dsnSource = [
      "From: mailer-daemon@relay.example.com",
      "Content-Type: multipart/report; report-type=delivery-status",
      "",
      "Status: 5.1.1",
      `Original-Recipient: rfc822;${contact.email}`,
    ].join("\n");

    await runPoll(new Date(), () => fakeImapClient([{ from: "mailer-daemon@relay.example.com", source: dsnSource }]));

    const [updatedMailbox] = await db.select().from(mailboxes).where(eq(mailboxes.id, mailbox.id));
    expect(updatedMailbox.health).toBe("healthy");
  });

  it("records a heartbeat after polling, even with nothing to poll", async () => {
    const before = new Date();
    await runPoll(new Date(), () => fakeImapClient([]));

    const [heartbeat] = await db.select().from(workerHeartbeats).where(eq(workerHeartbeats.process, "poller"));
    expect(heartbeat).toBeDefined();
    expect(heartbeat.lastRunAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(heartbeat.lastResult).toMatchObject({ mailboxesPolled: 0, replied: 0, bounced: 0 });
  });
});
