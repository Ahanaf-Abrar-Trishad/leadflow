import { sql, eq } from "drizzle-orm";
import { db, queryClient } from "@/db/client";
import { campaigns, campaignMailboxes, contacts, enrollments, mailboxes, sequenceSteps } from "@/db/schema";
import { POST } from "@/app/api/outreach/contacts/import/route";

describe("POST /api/outreach/contacts/import (integration)", () => {
  beforeEach(async () => {
    await db.execute(
      sql`TRUNCATE TABLE messages, events, enrollments, sequence_steps, campaign_mailboxes, campaigns, mailboxes, contacts, suppressions RESTART IDENTITY CASCADE`,
    );
  });

  afterAll(async () => {
    await queryClient.end({ timeout: 5 });
  });

  it("leaves imported contacts pending for a draft campaign (unchanged behavior)", async () => {
    const [campaign] = await db
      .insert(campaigns)
      .values({ name: "Draft test", postalAddress: "123 Main St", status: "draft" })
      .returning();

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ campaignId: campaign.id, emailColumn: "email", rows: [{ email: "a@acme.com", first_name: "Alex" }] }),
      }),
    );

    expect(response.status).toBe(200);
    const [enrollment] = await db.select().from(enrollments).where(eq(enrollments.campaignId, campaign.id));
    expect(enrollment.status).toBe("pending");
    expect(enrollment.nextSendAt).toBeNull();
  });

  it("schedules contacts imported into an already-active campaign instead of leaving them pending", async () => {
    const [mailbox] = await db
      .insert(mailboxes)
      .values({ provider: "gmail_oauth", fromName: "Jane", fromEmail: "jane@gmail.com", encryptedCredentials: "x", dailyCap: 50 })
      .returning();
    const [campaign] = await db
      .insert(campaigns)
      .values({ name: "Active test", postalAddress: "123 Main St", status: "active" })
      .returning();
    await db.insert(campaignMailboxes).values({ campaignId: campaign.id, mailboxId: mailbox.id });
    await db.insert(sequenceSteps).values({
      campaignId: campaign.id,
      stepOrder: 1,
      subjectTemplate: "Hi {{first_name}}",
      bodyTemplate: "Hi {{first_name}},\n\n\n\nUnsubscribe: {{unsubscribe_token}}",
      delayDays: 0,
    });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ campaignId: campaign.id, emailColumn: "email", rows: [{ email: "b@acme.com", first_name: "Bailey" }] }),
      }),
    );

    expect(response.status).toBe(200);
    const [contact] = await db.select().from(contacts).where(eq(contacts.email, "b@acme.com"));
    const [enrollment] = await db.select().from(enrollments).where(eq(enrollments.contactId, contact.id));
    expect(enrollment.status).toBe("active");
    expect(enrollment.mailboxId).toBe(mailbox.id);
    expect(enrollment.nextSendAt).not.toBeNull();
  });

  it("reports a scheduling warning (without failing the import) when the active campaign's pool can't currently accept new contacts", async () => {
    const [campaign] = await db
      .insert(campaigns)
      .values({ name: "No pool", postalAddress: "123 Main St", status: "active" })
      .returning();
    // No campaignMailboxes row at all - nothing eligible to schedule against.

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ campaignId: campaign.id, emailColumn: "email", rows: [{ email: "c@acme.com" }] }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.imported).toBe(1);
    expect(body.schedulingWarning).toBeTruthy();

    const [contact] = await db.select().from(contacts).where(eq(contacts.email, "c@acme.com"));
    const [enrollment] = await db.select().from(enrollments).where(eq(enrollments.contactId, contact.id));
    expect(enrollment.status).toBe("pending");
  });
});
