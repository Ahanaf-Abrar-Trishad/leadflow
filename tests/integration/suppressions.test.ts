import { sql, eq } from "drizzle-orm";
import { db, queryClient } from "@/db/client";
import { suppressions } from "@/db/schema";
import { GET, POST } from "@/app/api/outreach/suppressions/route";
import { DELETE } from "@/app/api/outreach/suppressions/[id]/route";

describe("suppressions routes (integration)", () => {
  beforeEach(async () => {
    await db.execute(sql`TRUNCATE TABLE suppressions RESTART IDENTITY CASCADE`);
  });

  afterAll(async () => {
    await queryClient.end({ timeout: 5 });
  });

  it("manually adds a suppression", async () => {
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ email: "asked-to-be-removed@example.com", reason: "Direct request via support email" }),
      }),
    );

    expect(response.status).toBe(201);
    const rows = await db.select().from(suppressions).where(eq(suppressions.email, "asked-to-be-removed@example.com"));
    expect(rows).toHaveLength(1);
    expect(rows[0].reason).toBe("Direct request via support email");
  });

  it("rejects a duplicate suppression for the same email", async () => {
    await db.insert(suppressions).values({ email: "already@example.com", reason: "hard_bounce" });

    const response = await POST(
      new Request("http://localhost", { method: "POST", body: JSON.stringify({ email: "already@example.com", reason: "manual" }) }),
    );

    expect(response.status).toBe(409);
  });

  it("lists suppressions", async () => {
    await db.insert(suppressions).values([
      { email: "a@example.com", reason: "hard_bounce" },
      { email: "b@example.com", reason: "manual" },
    ]);

    const response = await GET(new Request("http://localhost"));
    const body = await response.json();
    expect(body.suppressions).toHaveLength(2);
  });

  it("removes a suppression", async () => {
    const [row] = await db.insert(suppressions).values({ email: "a@example.com", reason: "manual" }).returning();

    const response = await DELETE(new Request("http://localhost", { method: "DELETE" }), {
      params: Promise.resolve({ id: row.id }),
    });

    expect(response.status).toBe(200);
    const remaining = await db.select().from(suppressions).where(eq(suppressions.id, row.id));
    expect(remaining).toHaveLength(0);
  });
});
