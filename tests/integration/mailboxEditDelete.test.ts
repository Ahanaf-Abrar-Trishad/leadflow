import { sql, eq } from "drizzle-orm";
import { db, queryClient } from "@/db/client";
import { campaigns, campaignMailboxes, contacts, enrollments, mailboxes } from "@/db/schema";
import { PATCH, DELETE } from "@/app/api/outreach/mailboxes/[id]/route";

describe("PATCH/DELETE /api/outreach/mailboxes/[id] (integration)", () => {
  beforeEach(async () => {
    await db.execute(
      sql`TRUNCATE TABLE messages, events, enrollments, sequence_steps, campaign_mailboxes, campaigns, mailboxes, contacts, suppressions RESTART IDENTITY CASCADE`,
    );
  });

  afterAll(async () => {
    await queryClient.end({ timeout: 5 });
  });

  it("edits a mailbox's fromName and dailyCap", async () => {
    const [mailbox] = await db
      .insert(mailboxes)
      .values({ provider: "smtp", fromName: "Old", fromEmail: "a@example.com", encryptedCredentials: "x", dailyCap: 50 })
      .returning();

    const response = await PATCH(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ fromName: "New", dailyCap: 30 }) }),
      { params: Promise.resolve({ id: mailbox.id }) },
    );

    expect(response.status).toBe(200);
    const [updated] = await db.select().from(mailboxes).where(eq(mailboxes.id, mailbox.id));
    expect(updated.fromName).toBe("New");
    expect(updated.dailyCap).toBe(30);
  });

  it("deletes a mailbox with no live enrollment depending on it", async () => {
    const [mailbox] = await db
      .insert(mailboxes)
      .values({ provider: "smtp", fromName: "A", fromEmail: "a@example.com", encryptedCredentials: "x", dailyCap: 50 })
      .returning();

    const response = await DELETE(new Request("http://localhost", { method: "DELETE" }), {
      params: Promise.resolve({ id: mailbox.id }),
    });

    expect(response.status).toBe(200);
    const remaining = await db.select().from(mailboxes).where(eq(mailboxes.id, mailbox.id));
    expect(remaining).toHaveLength(0);
  });

  it("refuses to delete a mailbox with a live (active/pending) enrollment assigned to it", async () => {
    const [mailbox] = await db
      .insert(mailboxes)
      .values({ provider: "smtp", fromName: "A", fromEmail: "a@example.com", encryptedCredentials: "x", dailyCap: 50 })
      .returning();
    const [campaign] = await db
      .insert(campaigns)
      .values({ name: "Test", postalAddress: "123 Main St", status: "active" })
      .returning();
    await db.insert(campaignMailboxes).values({ campaignId: campaign.id, mailboxId: mailbox.id });
    const [contact] = await db.insert(contacts).values({ email: "a@acme.com", fields: {} }).returning();
    await db.insert(enrollments).values({ campaignId: campaign.id, contactId: contact.id, mailboxId: mailbox.id, status: "active" });

    const response = await DELETE(new Request("http://localhost", { method: "DELETE" }), {
      params: Promise.resolve({ id: mailbox.id }),
    });

    expect(response.status).toBe(409);
    const remaining = await db.select().from(mailboxes).where(eq(mailboxes.id, mailbox.id));
    expect(remaining).toHaveLength(1);
  });

  it("deletes a mailbox with only historical (completed) enrollments and past pool membership, without a foreign-key error", async () => {
    const [mailbox] = await db
      .insert(mailboxes)
      .values({ provider: "smtp", fromName: "A", fromEmail: "a@example.com", encryptedCredentials: "x", dailyCap: 50 })
      .returning();
    const [campaign] = await db
      .insert(campaigns)
      .values({ name: "Finished campaign", postalAddress: "123 Main St", status: "active" })
      .returning();
    await db.insert(campaignMailboxes).values({ campaignId: campaign.id, mailboxId: mailbox.id });
    const [contact] = await db.insert(contacts).values({ email: "a@acme.com", fields: {} }).returning();
    const [enrollment] = await db
      .insert(enrollments)
      .values({ campaignId: campaign.id, contactId: contact.id, mailboxId: mailbox.id, status: "completed" })
      .returning();

    const response = await DELETE(new Request("http://localhost", { method: "DELETE" }), {
      params: Promise.resolve({ id: mailbox.id }),
    });

    expect(response.status).toBe(200);
    const remainingMailbox = await db.select().from(mailboxes).where(eq(mailboxes.id, mailbox.id));
    expect(remainingMailbox).toHaveLength(0);

    // The enrollment itself survives as historical record, just detached
    // from the now-gone mailbox.
    const [updatedEnrollment] = await db.select().from(enrollments).where(eq(enrollments.id, enrollment.id));
    expect(updatedEnrollment).toBeDefined();
    expect(updatedEnrollment.mailboxId).toBeNull();

    // The pool-membership row is gone - it has no meaning once the
    // mailbox side is gone.
    const remainingPool = await db.select().from(campaignMailboxes).where(eq(campaignMailboxes.campaignId, campaign.id));
    expect(remainingPool).toHaveLength(0);
  });
});
