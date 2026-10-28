import { sql, eq } from "drizzle-orm";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { db, queryClient } from "@/db/client";
import { aiDrafts, campaigns, contacts, leads } from "@/db/schema";
import { upsertLeads } from "@/lib/leads/upsert";
import { approveDraft, listLeadsNeedingIcebreaker, rejectDraft, saveIcebreakerDraft } from "@/lib/ai/drafts";
import { GET, POST } from "@/app/api/mcp/[token]/route";
import { POST as enrollLeads } from "@/app/api/outreach/leads/enroll/route";

const TOKEN = "t".repeat(40);
const LINE = "Noticed your 400+ Google reviews mention how gentle Dr. Lee is with kids.";

async function seedLeads() {
  const { ids } = await upsertLeads(
    [
      { name: "Bright Smile", email: "a@brightsmile.com", website: "https://brightsmile.com", reviewCount: 412 },
      { name: "No Email Dental", phone: "555", externalId: "p2" },
      { name: "Gone Dental", email: "b@gone.com" },
    ],
    { source: "gmaps" },
  );
  await db.update(leads).set({ status: "disqualified" }).where(eq(leads.name, "Gone Dental"));
  const [bright] = await db.select().from(leads).where(eq(leads.name, "Bright Smile"));
  return { ids, bright };
}

describe("AI drafts (integration)", () => {
  beforeEach(async () => {
    await db.execute(
      sql`TRUNCATE TABLE ai_drafts, leads, scrape_jobs, messages, events, enrollments, sequence_steps, campaign_mailboxes, campaigns, mailboxes, contacts, suppressions RESTART IDENTITY CASCADE`,
    );
  });

  afterAll(async () => {
    await queryClient.end({ timeout: 5 });
  });

  it("offers only reachable, qualified leads with no line yet, and drops them once a draft is pending", async () => {
    const { bright } = await seedLeads();
    expect((await listLeadsNeedingIcebreaker(10)).map((lead) => lead.name)).toEqual(["Bright Smile"]);

    await saveIcebreakerDraft(bright.id, LINE, "412 reviews");
    expect(await listLeadsNeedingIcebreaker(10)).toEqual([]);
  });

  it("replaces a pending draft instead of stacking a second one", async () => {
    const { bright } = await seedLeads();
    await saveIcebreakerDraft(bright.id, LINE, "first");
    await saveIcebreakerDraft(bright.id, `${LINE} Second take.`, "second");
    const drafts = await db.select().from(aiDrafts);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].observations).toBe("second");
  });

  it("refuses drafts for disqualified leads", async () => {
    await seedLeads();
    const [gone] = await db.select().from(leads).where(eq(leads.name, "Gone Dental"));
    await expect(saveIcebreakerDraft(gone.id, LINE, "")).rejects.toThrow(/disqualified/);
  });

  it("approving sets the lead's icebreaker and updates an already-enrolled contact", async () => {
    const { bright } = await seedLeads();
    const [campaign] = await db.insert(campaigns).values({ name: "C", postalAddress: "1 Main St" }).returning();
    await enrollLeads(new Request("http://localhost", { method: "POST", body: JSON.stringify({ campaignId: campaign.id, leadIds: [bright.id] }) }));

    const draftId = await saveIcebreakerDraft(bright.id, LINE, "412 reviews");
    const edited = "Saw that parents in your 400+ Google reviews keep mentioning how gentle Dr. Lee is.";
    await approveDraft(draftId, edited);

    const [draft] = await db.select().from(aiDrafts).where(eq(aiDrafts.id, draftId));
    expect(draft).toMatchObject({ status: "approved", edited: true, content: edited });
    const [lead] = await db.select().from(leads).where(eq(leads.id, bright.id));
    expect(lead.icebreaker).toBe(edited);
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, lead.contactId!));
    expect(contact.fields).toMatchObject({ icebreaker: edited, company: "Bright Smile" });

    await expect(approveDraft(draftId)).rejects.toThrow(/no longer waiting/);
  });

  it("a rejected lead is not offered to Claude again", async () => {
    const { bright } = await seedLeads();
    const draftId = await saveIcebreakerDraft(bright.id, LINE, "");
    await rejectDraft(draftId);
    expect(await listLeadsNeedingIcebreaker(10)).toEqual([]);
    const [lead] = await db.select().from(leads).where(eq(leads.id, bright.id));
    expect(lead.icebreaker).toBeNull();
  });

  describe("MCP endpoint", () => {
    const original = process.env.MCP_ACCESS_TOKEN;
    beforeEach(() => {
      process.env.MCP_ACCESS_TOKEN = TOKEN;
    });
    afterEach(() => {
      process.env.MCP_ACCESS_TOKEN = original;
    });

    /** Routes the real MCP client straight into the route handler. */
    function connectClient(token: string) {
      const handler = async (input: string | URL | Request, init?: RequestInit) => {
        const request = new Request(input, init);
        const params = { params: Promise.resolve({ token }) };
        return request.method === "GET" ? GET(request, params) : POST(request, params);
      };
      const transport = new StreamableHTTPClientTransport(new URL(`http://localhost/api/mcp/${token}`), { fetch: handler });
      const client = new Client({ name: "test", version: "1.0.0" });
      return { client, transport };
    }

    it("answers 404 to a wrong token", async () => {
      const response = await POST(new Request("http://localhost", { method: "POST", body: "{}" }), {
        params: Promise.resolve({ token: "w".repeat(40) }),
      });
      expect(response.status).toBe(404);
    });

    it("lets a real MCP client list leads and save a draft that lands in the approval queue", async () => {
      const { bright } = await seedLeads();
      const { client, transport } = connectClient(TOKEN);
      await client.connect(transport);

      expect(client.getInstructions()).toMatch(/untrusted/);
      const { tools } = await client.listTools();
      expect(tools.map((tool) => tool.name).sort()).toEqual([
        "get_lead_research",
        "get_queue_status",
        "list_leads_needing_icebreaker",
        "save_icebreaker_draft",
      ]);

      const listed = await client.callTool({ name: "list_leads_needing_icebreaker", arguments: { limit: 5 } });
      const payload = JSON.parse((listed.content as { text: string }[])[0].text);
      expect(payload.leads.map((lead: { id: string }) => lead.id)).toEqual([bright.id]);

      const bad = await client.callTool({ name: "save_icebreaker_draft", arguments: { lead_id: bright.id, icebreaker: "Hi!", observations: "" } });
      expect(bad.isError).toBe(true);

      const saved = await client.callTool({
        name: "save_icebreaker_draft",
        arguments: { lead_id: bright.id, icebreaker: LINE, observations: "412 Google reviews" },
      });
      expect(saved.isError).toBeFalsy();

      const status = await client.callTool({ name: "get_queue_status", arguments: {} });
      expect(JSON.parse((status.content as { text: string }[])[0].text)).toEqual({ leadsNeedingIcebreaker: 0, draftsAwaitingReview: 1 });

      const [draft] = await db.select().from(aiDrafts);
      expect(draft).toMatchObject({ leadId: bright.id, status: "pending", content: LINE });
      await client.close();
    });
  });
});
