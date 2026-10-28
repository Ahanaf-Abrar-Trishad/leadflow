import { sql, eq } from "drizzle-orm";
import { db, queryClient } from "@/db/client";
import { mailboxes } from "@/db/schema";
import { PATCH } from "@/app/api/outreach/mailboxes/[id]/resume/route";

describe("PATCH /api/outreach/mailboxes/[id]/resume (integration)", () => {
  beforeEach(async () => {
    await db.execute(sql`TRUNCATE TABLE mailboxes RESTART IDENTITY CASCADE`);
  });

  afterAll(async () => {
    await queryClient.end({ timeout: 5 });
  });

  it("resumes a paused mailbox", async () => {
    const [mailbox] = await db
      .insert(mailboxes)
      .values({ provider: "smtp", fromName: "Jane", fromEmail: "jane@example.com", encryptedCredentials: "x", dailyCap: 50, health: "paused" })
      .returning();

    const response = await PATCH(new Request("http://localhost", { method: "PATCH" }), {
      params: Promise.resolve({ id: mailbox.id }),
    });

    expect(response.status).toBe(200);
    const [updated] = await db.select().from(mailboxes).where(eq(mailboxes.id, mailbox.id));
    expect(updated.health).toBe("healthy");
  });

  it("rejects resuming a mailbox that isn't paused", async () => {
    const [mailbox] = await db
      .insert(mailboxes)
      .values({ provider: "smtp", fromName: "Jane", fromEmail: "jane@example.com", encryptedCredentials: "x", dailyCap: 50, health: "healthy" })
      .returning();

    const response = await PATCH(new Request("http://localhost", { method: "PATCH" }), {
      params: Promise.resolve({ id: mailbox.id }),
    });

    expect(response.status).toBe(409);
  });

  it("404s for a mailbox that doesn't exist", async () => {
    const response = await PATCH(new Request("http://localhost", { method: "PATCH" }), {
      params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }),
    });

    expect(response.status).toBe(404);
  });
});
