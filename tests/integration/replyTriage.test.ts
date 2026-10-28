import { sql, eq } from "drizzle-orm";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { db, queryClient } from "@/db/client";
import { aiDrafts, campaigns, contacts, deals, enrollments, leads, mailboxes, messages, replies, sequenceSteps } from "@/db/schema";
import { listRepliesToTriage, markReplyDraftSent, triageReply, getPendingReplyDraft, discardReplyDraft, countRepliesToTriage } from "@/lib/ai/replies";
import { countPendingDrafts } from "@/lib/ai/drafts";
import { ensureDealForEnrollment, listDeals, updateDeal } from "@/lib/deals/deals";
import { POST as mcpPost } from "@/app/api/mcp/[token]/route";
import { PATCH as patchDeal } from "@/app/api/outreach/deals/[id]/route";
import { POST as addToPipeline } from "@/app/api/outreach/replies/[id]/pipeline/route";

const TOKEN = "r".repeat(40);
const ANSWER = "Happy to help. Would a 15-minute call on Thursday work to walk through what the redesign would involve?\n\nBest,";

async function seedThread(replyBody = "Sounds interesting - can you send me a quote for a new website?") {
  const [mailbox] = await db
    .insert(mailboxes)
    .values({ provider: "smtp", fromName: "Sam", fromEmail: "sam@agency.com", encryptedCredentials: "x" })
    .returning();
  const [campaign] = await db.insert(campaigns).values({ name: "Austin dentists", postalAddress: "1 Main St", status: "active" }).returning();
  const [step] = await db
    .insert(sequenceSteps)
    .values({ campaignId: campaign.id, stepOrder: 1, subjectTemplate: "Quick idea for {{company}}", bodyTemplate: "Hi {{greeting}}, {{icebreaker}}" })
    .returning();
  const [contact] = await db
    .insert(contacts)
    .values({ email: "dr@brightsmile.com", fields: { company: "Bright Smile", greeting: "there", icebreaker: "Loved your reviews." } })
    .returning();
  const [lead] = await db
    .insert(leads)
    .values({ dedupeKey: "domain:brightsmile.com", source: "gmaps", name: "Bright Smile Dental", email: "dr@brightsmile.com", contactId: contact.id })
    .returning();
  const [enrollment] = await db
    .insert(enrollments)
    .values({ campaignId: campaign.id, contactId: contact.id, mailboxId: mailbox.id, status: "replied" })
    .returning();
  await db.insert(messages).values({ enrollmentId: enrollment.id, stepId: step.id, rfcMessageId: "<m1@agency.com>", sentAt: new Date(Date.now() - 86_400_000) });
  const [reply] = await db
    .insert(replies)
    .values({ enrollmentId: enrollment.id, mailboxId: mailbox.id, fromAddress: contact.email, subject: "Re: Quick idea", snippet: replyBody, bodyText: replyBody })
    .returning();
  return { contact, lead, enrollment, reply };
}

describe("reply triage and pipeline (integration)", () => {
  beforeEach(async () => {
    await db.execute(
      sql`TRUNCATE TABLE deals, ai_drafts, leads, replies, messages, events, enrollments, sequence_steps, campaign_mailboxes, campaigns, mailboxes, contacts, suppressions RESTART IDENTITY CASCADE`,
    );
  });

  afterAll(async () => {
    await queryClient.end({ timeout: 5 });
  });

  it("lists untriaged replies with the earlier messages rendered as the contact saw them", async () => {
    const { reply } = await seedThread();
    const [item] = await listRepliesToTriage(10);
    expect(item.replyId).toBe(reply.id);
    expect(item.contact).toMatchObject({ email: "dr@brightsmile.com", company: "Bright Smile" });
    expect(item.thread).toEqual([expect.objectContaining({ from: "us", text: "Hi there, Loved your reviews." })]);
  });

  it("an interested reply gets a label, a pending draft for the inbox, and a deal linked to the lead", async () => {
    const { reply, enrollment, lead } = await seedThread();
    const result = await triageReply(reply.id, "interested", 'Asked "can you send me a quote".', ANSWER);
    expect(result).toEqual({ dealCreated: true, draftSaved: true });

    const [updated] = await db.select().from(replies).where(eq(replies.id, reply.id));
    expect(updated).toMatchObject({ classification: "interested", classificationNote: 'Asked "can you send me a quote".' });
    expect(await countRepliesToTriage()).toBe(0);

    const draft = await getPendingReplyDraft(enrollment.id);
    expect(draft?.content).toBe(ANSWER);
    // Reply drafts are reviewed in the inbox, not on the icebreaker Approvals page.
    expect(await countPendingDrafts()).toBe(0);

    const [deal] = await listDeals();
    expect(deal).toMatchObject({ title: "Bright Smile Dental", stage: "replied", enrollmentId: enrollment.id });
    const [dealRow] = await db.select().from(deals);
    expect(dealRow.leadId).toBe(lead.id);

    // Re-triage: no duplicate deal, draft replaced rather than stacked.
    expect(await triageReply(reply.id, "interested", "again", `${ANSWER} Thanks!`)).toEqual({ dealCreated: false, draftSaved: true });
    expect(await db.select().from(deals)).toHaveLength(1);
    expect(await db.select().from(aiDrafts)).toHaveLength(1);
  });

  it("refuses a draft for an unsubscribe and never suppresses on its own", async () => {
    const { reply } = await seedThread("Please remove me from your list.");
    await expect(triageReply(reply.id, "unsubscribe", "Asked to be removed.", "Sorry about that!")).rejects.toThrow(/Do not draft/);
    await triageReply(reply.id, "unsubscribe", "Asked to be removed.");
    const [updated] = await db.select().from(replies).where(eq(replies.id, reply.id));
    expect(updated.classification).toBe("unsubscribe");
    const suppressed = await db.execute(sql`select count(*)::int as n from suppressions`);
    expect(suppressed[0].n).toBe(0);
    expect(await db.select().from(deals)).toHaveLength(0);
  });

  it("records a sent draft as approved and notes whether it was edited; discarding rejects it", async () => {
    const { reply, enrollment } = await seedThread();
    await triageReply(reply.id, "question", "Asked about price.", ANSWER);
    const draft = await getPendingReplyDraft(enrollment.id);
    await markReplyDraftSent(draft!.id, enrollment.id, `${ANSWER} Sam`);
    const [sent] = await db.select().from(aiDrafts).where(eq(aiDrafts.id, draft!.id));
    expect(sent).toMatchObject({ status: "approved", edited: true });

    await triageReply(reply.id, "question", "Asked about price.", ANSWER);
    expect(await discardReplyDraft(enrollment.id)).toBe(true);
    expect(await getPendingReplyDraft(enrollment.id)).toBeNull();
  });

  it("moves a deal through stages, keeping a lost reason only on lost deals", async () => {
    const { enrollment } = await seedThread();
    const created = await addToPipeline(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: enrollment.id }),
    });
    expect(created.status).toBe(201);
    const { dealId } = (await ensureDealForEnrollment(enrollment.id))!;

    const patch = (body: unknown) =>
      patchDeal(new Request("http://localhost", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id: dealId }) });
    expect((await patch({ stage: "lost", lostReason: "Went with a cousin", valueUsd: 3000 })).status).toBe(200);
    expect((await patch({ stage: "nope" })).status).toBe(400);
    let [deal] = await listDeals();
    expect(deal).toMatchObject({ stage: "lost", lostReason: "Went with a cousin", valueUsd: 3000 });

    await updateDeal(dealId, { stage: "proposal" });
    [deal] = await listDeals();
    expect(deal).toMatchObject({ stage: "proposal", lostReason: null });
  });

  it("drives triage end to end through the MCP connector", async () => {
    const original = process.env.MCP_ACCESS_TOKEN;
    process.env.MCP_ACCESS_TOKEN = TOKEN;
    try {
      const { reply, enrollment } = await seedThread();
      const handler = async (input: string | URL | Request, init?: RequestInit) =>
        mcpPost(new Request(input, init), { params: Promise.resolve({ token: TOKEN }) });
      const client = new Client({ name: "test", version: "1.0.0" });
      await client.connect(new StreamableHTTPClientTransport(new URL(`http://localhost/api/mcp/${TOKEN}`), { fetch: handler }));

      const status = await client.callTool({ name: "get_queue_status", arguments: {} });
      expect(JSON.parse((status.content as { text: string }[])[0].text)).toMatchObject({ repliesToTriage: 1 });

      const result = await client.callTool({
        name: "triage_reply",
        arguments: { reply_id: reply.id, category: "interested", note: "Asked for a quote.", draft_reply: ANSWER },
      });
      expect(result.isError).toBeFalsy();
      expect(await getPendingReplyDraft(enrollment.id)).not.toBeNull();

      const bad = await client.callTool({ name: "triage_reply", arguments: { reply_id: reply.id, category: "spam", note: "" } });
      expect(bad.isError).toBe(true);
      await client.close();
    } finally {
      process.env.MCP_ACCESS_TOKEN = original;
    }
  });
});
