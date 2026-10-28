import { sql } from "drizzle-orm";
import { db, queryClient } from "@/db/client";
import { contacts, suppressions } from "@/db/schema";
import { dedupeContacts } from "@/lib/outreach/contacts/dedupe";

describe("dedupeContacts (integration)", () => {
  beforeEach(async () => {
    await db.execute(sql`TRUNCATE TABLE contacts, suppressions RESTART IDENTITY CASCADE`);
  });

  afterAll(async () => {
    await queryClient.end({ timeout: 5 });
  });

  it("keeps rows that are new", async () => {
    const result = await dedupeContacts([{ email: "new@example.com", fields: {} }]);
    expect(result.toInsert).toEqual([{ email: "new@example.com", fields: {} }]);
    expect(result.skippedExisting).toEqual([]);
    expect(result.skippedSuppressed).toEqual([]);
  });

  it("skips rows that already exist as a contact", async () => {
    await db.insert(contacts).values({ email: "existing@example.com", fields: {} });
    const result = await dedupeContacts([{ email: "existing@example.com", fields: {} }]);
    expect(result.toInsert).toEqual([]);
    expect(result.skippedExisting).toEqual(["existing@example.com"]);
  });

  it("skips rows on the suppression list, even if not yet a contact", async () => {
    await db.insert(suppressions).values({ email: "blocked@example.com", reason: "unsubscribed" });
    const result = await dedupeContacts([{ email: "blocked@example.com", fields: {} }]);
    expect(result.toInsert).toEqual([]);
    expect(result.skippedSuppressed).toEqual(["blocked@example.com"]);
  });
});
