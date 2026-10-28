import { sql, eq } from "drizzle-orm";
import { db, queryClient } from "@/db/client";
import { campaigns } from "@/db/schema";
import { PATCH as pausePATCH } from "@/app/api/outreach/campaigns/[id]/pause/route";
import { PATCH as resumePATCH } from "@/app/api/outreach/campaigns/[id]/resume/route";

describe("campaign pause/resume (integration)", () => {
  beforeEach(async () => {
    await db.execute(sql`TRUNCATE TABLE campaigns RESTART IDENTITY CASCADE`);
  });

  afterAll(async () => {
    await queryClient.end({ timeout: 5 });
  });

  it("pauses an active campaign", async () => {
    const [campaign] = await db
      .insert(campaigns)
      .values({ name: "Test", postalAddress: "123 Main St", status: "active" })
      .returning();

    const response = await pausePATCH(new Request("http://localhost", { method: "PATCH" }), {
      params: Promise.resolve({ id: campaign.id }),
    });

    expect(response.status).toBe(200);
    const [updated] = await db.select().from(campaigns).where(eq(campaigns.id, campaign.id));
    expect(updated.status).toBe("paused");
  });

  it("rejects pausing a campaign that isn't active", async () => {
    const [campaign] = await db
      .insert(campaigns)
      .values({ name: "Test", postalAddress: "123 Main St", status: "draft" })
      .returning();

    const response = await pausePATCH(new Request("http://localhost", { method: "PATCH" }), {
      params: Promise.resolve({ id: campaign.id }),
    });

    expect(response.status).toBe(409);
  });

  it("resumes a paused campaign", async () => {
    const [campaign] = await db
      .insert(campaigns)
      .values({ name: "Test", postalAddress: "123 Main St", status: "paused" })
      .returning();

    const response = await resumePATCH(new Request("http://localhost", { method: "PATCH" }), {
      params: Promise.resolve({ id: campaign.id }),
    });

    expect(response.status).toBe(200);
    const [updated] = await db.select().from(campaigns).where(eq(campaigns.id, campaign.id));
    expect(updated.status).toBe("active");
  });

  it("rejects resuming a campaign that isn't paused", async () => {
    const [campaign] = await db
      .insert(campaigns)
      .values({ name: "Test", postalAddress: "123 Main St", status: "active" })
      .returning();

    const response = await resumePATCH(new Request("http://localhost", { method: "PATCH" }), {
      params: Promise.resolve({ id: campaign.id }),
    });

    expect(response.status).toBe(409);
  });

  it("404s for a campaign that doesn't exist", async () => {
    const response = await pausePATCH(new Request("http://localhost", { method: "PATCH" }), {
      params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }),
    });
    expect(response.status).toBe(404);
  });
});
