import { sql, eq } from "drizzle-orm";
import { db, queryClient } from "@/db/client";
import {
  campaigns,
  campaignMailboxes,
  contacts,
  enrollments,
  mailboxes,
  messages,
  sequenceSteps,
} from "@/db/schema";
import { encrypt, loadEncryptionKey } from "@/lib/outreach/crypto";
import { getCurrentUser } from "@/lib/outreach/auth/currentUser";

// jest.mock() with the "@/" alias doesn't resolve under this project's Jest
// config (next/jest's moduleNameMapper isn't applied to jest.mock()'s own
// resolution) - relative paths work fine for the mock target, while
// regular imports elsewhere in this file keep using "@/".
jest.mock("../../lib/outreach/auth/currentUser");
const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>;

jest.mock("../../lib/outreach/transport/smtp", () => ({
  createSmtpTransport: jest.fn(() => ({
    async verify() {},
    async send(message: unknown) {
      sentMessages.push(message);
      return { rfcMessageId: `<fake-${sentMessages.length}@test>` };
    },
  })),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sentMessages: any[] = [];

import { POST } from "@/app/api/outreach/enrollments/[id]/send-now/route";

describe("POST /api/outreach/enrollments/[id]/send-now (integration)", () => {
  beforeEach(async () => {
    sentMessages.length = 0;
    mockGetCurrentUser.mockResolvedValue({ id: "u1", email: "admin@example.com", role: "admin" });
    await db.execute(
      sql`TRUNCATE TABLE messages, events, enrollments, sequence_steps, campaign_mailboxes, campaigns, mailboxes, contacts, suppressions RESTART IDENTITY CASCADE`,
    );
  });

  afterAll(async () => {
    await queryClient.end({ timeout: 5 });
  });

  async function makeActiveEnrollment(opts: { mailboxHealth?: string; campaignStatus?: string; nextSendAt?: Date | null } = {}) {
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
        health: opts.mailboxHealth ?? "healthy",
      })
      .returning();
    const [campaign] = await db
      .insert(campaigns)
      .values({ name: "Test", postalAddress: "123 Main St", status: opts.campaignStatus ?? "active" })
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
      .values({
        campaignId: campaign.id,
        contactId: contact.id,
        mailboxId: mailbox.id,
        status: "active",
        nextSendAt: opts.nextSendAt === undefined ? new Date(Date.now() + 60 * 60 * 1000) : opts.nextSendAt,
      })
      .returning();
    return { mailbox, campaign, contact, enrollment };
  }

  it("sends immediately even though nextSendAt is far in the future", async () => {
    const { enrollment } = await makeActiveEnrollment({ nextSendAt: new Date(Date.now() + 60 * 60 * 1000) });

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: enrollment.id }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ sent: true });
    expect(sentMessages).toHaveLength(1);

    const sentRows = await db.select().from(messages).where(eq(messages.enrollmentId, enrollment.id));
    expect(sentRows).toHaveLength(1);
  });

  it("returns 401 when not signed in", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const { enrollment } = await makeActiveEnrollment();

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: enrollment.id }),
    });

    expect(response.status).toBe(401);
    expect(sentMessages).toHaveLength(0);
  });

  it("returns 404 for an enrollment that doesn't exist", async () => {
    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }),
    });

    expect(response.status).toBe(404);
  });

  it("returns 409 for an enrollment that isn't active", async () => {
    const { enrollment } = await makeActiveEnrollment();
    await db.update(enrollments).set({ status: "completed" }).where(eq(enrollments.id, enrollment.id));

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: enrollment.id }),
    });

    expect(response.status).toBe(409);
    expect(sentMessages).toHaveLength(0);
  });

  it("returns 409 when the mailbox isn't healthy", async () => {
    const { enrollment } = await makeActiveEnrollment({ mailboxHealth: "paused" });

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: enrollment.id }),
    });

    expect(response.status).toBe(409);
    expect(sentMessages).toHaveLength(0);
  });

  it("returns 409 when the campaign isn't active", async () => {
    const { enrollment } = await makeActiveEnrollment({ campaignStatus: "paused" });

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: enrollment.id }),
    });

    expect(response.status).toBe(409);
    expect(sentMessages).toHaveLength(0);
  });

  it("does not double-send when send-now races the worker's own tick", async () => {
    const { enrollment } = await makeActiveEnrollment({ nextSendAt: new Date(Date.now() - 1000) });

    const { runTick } = await import("@/worker/tick");
    const [routeResult] = await Promise.all([
      POST(new Request("http://localhost", { method: "POST" }), { params: Promise.resolve({ id: enrollment.id }) }),
      runTick(new Date(), () => ({
        async verify() {},
        async send(message: unknown) {
          sentMessages.push(message);
          return { rfcMessageId: `<fake-tick-${sentMessages.length}@test>` };
        },
      })),
    ]);

    // Whichever of the two wins the claim race sends it; the other backs
    // off with 409. Either outcome is correct - what matters is exactly
    // one send happens, never zero or two.
    expect([200, 409]).toContain(routeResult.status);
    expect(sentMessages).toHaveLength(1);
    const sentRows = await db.select().from(messages).where(eq(messages.enrollmentId, enrollment.id));
    expect(sentRows).toHaveLength(1);
  });
});
