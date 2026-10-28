import { sql, eq } from "drizzle-orm";
import { db, queryClient } from "@/db/client";
import { campaigns, contacts, deals, enrollments, events, proposals } from "@/db/schema";
import {
  getProposalByToken,
  listDealsNeedingProposal,
  markProposalSent,
  openProposalForDeal,
  proposalUrl,
  revokeProposal,
  saveClaudeProposalDraft,
  updateProposalDraft,
} from "@/lib/proposals/proposals";
import { POST as acceptRoute } from "@/app/api/p/[token]/accept/route";
import { POST as declineRoute } from "@/app/api/p/[token]/decline/route";
import { POST as sendRoute } from "@/app/api/outreach/proposals/[id]/send/route";

const DRAFT = {
  title: "A booking-ready website for Bright Smile",
  summary: "Patients ask to book online; the current site cannot take bookings.",
  sections: [{ heading: "What we will do", body: "Rebuild the site with online booking." }],
  lineItems: [
    { description: "Website redesign, up to 6 pages", billing: "one_time" as const },
    { description: "Local SEO", billing: "monthly" as const },
  ],
};

async function seedDeal(stage = "call_booked", withThread = false) {
  const [contact] = await db.insert(contacts).values({ email: "dr@brightsmile.com", fields: { company: "Bright Smile" } }).returning();
  let enrollmentId: string | undefined;
  if (withThread) {
    const [campaign] = await db.insert(campaigns).values({ name: "C", postalAddress: "1 Main St" }).returning();
    const [enrollment] = await db.insert(enrollments).values({ campaignId: campaign.id, contactId: contact.id }).returning();
    enrollmentId = enrollment.id;
  }
  const [deal] = await db.insert(deals).values({ contactId: contact.id, title: "Bright Smile Dental", stage, enrollmentId }).returning();
  return deal;
}

/** Prices every item and sets a future date, as the operator would. */
async function priceAndSend(proposalId: string) {
  const [proposal] = await db.select().from(proposals).where(eq(proposals.id, proposalId));
  await updateProposalDraft(proposalId, {
    title: proposal.title,
    summary: proposal.summary,
    sections: proposal.sections,
    lineItems: proposal.lineItems.map((item, index) => ({ ...item, amountUsd: index === 0 ? 4000 : 600 })),
    terms: proposal.terms,
    validUntil: new Date(Date.now() + 7 * 86_400_000),
    depositPercent: 50,
  });
  return markProposalSent(proposalId);
}

const tokenOf = (proposal: { id: string; linkVersion: number }) => proposalUrl(proposal).split("/p/")[1];

type PublicHandler = (request: Request, ctx: { params: Promise<{ token: string }> }) => Promise<Response>;

function post(handler: PublicHandler, token: string, body: unknown, headers: Record<string, string> = {}) {
  return handler(new Request("http://localhost", { method: "POST", body: JSON.stringify(body), headers }), {
    params: Promise.resolve({ token }),
  });
}

describe("proposals (integration)", () => {
  beforeEach(async () => {
    await db.execute(
      sql`TRUNCATE TABLE proposals, deals, ai_drafts, leads, replies, messages, events, enrollments, sequence_steps, campaign_mailboxes, campaigns, mailboxes, contacts, suppressions RESTART IDENTITY CASCADE`,
    );
  });

  afterAll(async () => {
    await queryClient.end({ timeout: 5 });
  });

  it("Claude's draft has no prices, cannot be sent until priced, and is not overwritten once a person edits it", async () => {
    const deal = await seedDeal();
    expect((await listDealsNeedingProposal(5)).map((d) => d.id)).toEqual([deal.id]);

    const id = await saveClaudeProposalDraft(deal.id, DRAFT);
    const [draft] = await db.select().from(proposals).where(eq(proposals.id, id));
    expect(draft).toMatchObject({ status: "draft", draftedBy: "claude" });
    expect(draft.lineItems.every((item) => item.amountUsd === null)).toBe(true);
    expect(await listDealsNeedingProposal(5)).toEqual([]);

    await expect(markProposalSent(id)).rejects.toThrow(/Set a price on every line item/);

    // Claude may revise its own untouched draft...
    expect(await saveClaudeProposalDraft(deal.id, { ...DRAFT, title: "Revised title" })).toBe(id);
    // ...but not once the operator has edited it.
    await priceAndSend(id);
    await expect(saveClaudeProposalDraft(deal.id, DRAFT)).rejects.toThrow(/edited or sent by a person/);
  });

  it("sending makes the link live and moves the deal to Proposal; back-to-draft revokes the old link", async () => {
    const deal = await seedDeal();
    const proposal = await openProposalForDeal(deal.id);
    expect(await getProposalByToken(tokenOf(proposal))).toBeNull(); // drafts are never public

    await updateProposalDraft(proposal.id, {
      ...proposal,
      sections: [{ heading: "Plan", body: "New site." }],
      lineItems: [{ description: "Redesign", amountUsd: 4000, billing: "one_time" }],
    });
    const sent = await markProposalSent(proposal.id);
    const oldToken = tokenOf(sent);
    expect((await getProposalByToken(oldToken))?.id).toBe(proposal.id);
    const [movedDeal] = await db.select().from(deals).where(eq(deals.id, deal.id));
    expect(movedDeal.stage).toBe("proposal");

    await revokeProposal(proposal.id, "draft");
    expect(await getProposalByToken(oldToken)).toBeNull();
    await expect(updateProposalDraft(proposal.id, { ...sent, title: "Edited again" })).resolves.toBeUndefined();
    const resent = await markProposalSent(proposal.id);
    expect(tokenOf(resent)).not.toBe(oldToken);
    expect(await getProposalByToken(tokenOf(resent))).not.toBeNull();
  });

  it("accepting records the signature and an exact copy of what was signed, marks the deal won, and only works once", async () => {
    const deal = await seedDeal();
    const sent = await priceAndSend(await saveClaudeProposalDraft(deal.id, DRAFT));
    const token = tokenOf(sent);

    expect((await post(acceptRoute, token, { name: "Dr. Lee", email: "dr@brightsmile.com", agreed: false })).status).toBe(400);

    const response = await post(
      acceptRoute,
      token,
      { name: "Dr. Jamie Lee", email: "DR@brightsmile.com", agreed: true },
      { "x-forwarded-for": "203.0.113.7, 10.0.0.1", "user-agent": "Mozilla/5.0 test" },
    );
    expect(response.status).toBe(200);

    const [accepted] = await db.select().from(proposals).where(eq(proposals.id, sent.id));
    expect(accepted).toMatchObject({
      status: "accepted",
      signerName: "Dr. Jamie Lee",
      signerEmail: "dr@brightsmile.com",
      signerIp: "203.0.113.7",
      signerUserAgent: "Mozilla/5.0 test",
    });
    expect(accepted.signedSnapshot).toMatchObject({
      title: DRAFT.title,
      lineItems: [expect.objectContaining({ amountUsd: 4000 }), expect.objectContaining({ amountUsd: 600 })],
    });
    const [wonDeal] = await db.select().from(deals).where(eq(deals.id, deal.id));
    expect(wonDeal.stage).toBe("won");
    expect((await db.select().from(events)).map((event) => event.type)).toContain("proposal_accepted");

    expect((await post(acceptRoute, token, { name: "Someone Else", email: "x@y.com", agreed: true })).status).toBe(409);
    await expect(updateProposalDraft(sent.id, { ...accepted, title: "Changed after signing" })).rejects.toThrow(/Only a draft/);
  });

  it("refuses to accept an expired proposal, and lets the client decline with a reason", async () => {
    const deal = await seedDeal();
    const sent = await priceAndSend(await saveClaudeProposalDraft(deal.id, DRAFT));
    await db.update(proposals).set({ validUntil: new Date(Date.now() - 1000) }).where(eq(proposals.id, sent.id));
    const expired = await post(acceptRoute, tokenOf(sent), { name: "Dr. Lee", email: "dr@brightsmile.com", agreed: true });
    expect(expired.status).toBe(409);

    expect((await post(declineRoute, tokenOf(sent), { reason: "Going with a friend." })).status).toBe(200);
    const [declined] = await db.select().from(proposals).where(eq(proposals.id, sent.id));
    expect(declined).toMatchObject({ status: "declined", declineReason: "Going with a friend." });
  });

  it("a forged or withdrawn link resolves to nothing", async () => {
    const deal = await seedDeal();
    const sent = await priceAndSend(await saveClaudeProposalDraft(deal.id, DRAFT));
    const token = tokenOf(sent);
    expect((await post(acceptRoute, `${token}x`, { name: "A B", email: "a@b.co", agreed: true })).status).toBe(404);
    await revokeProposal(sent.id, "withdrawn");
    expect((await post(acceptRoute, token, { name: "A B", email: "a@b.co", agreed: true })).status).toBe(404);
  });

  it("the send route makes the link live, and refuses to email a deal with no conversation", async () => {
    const deal = await seedDeal();
    const id = await saveClaudeProposalDraft(deal.id, DRAFT);
    const [proposal] = await db.select().from(proposals).where(eq(proposals.id, id));
    await updateProposalDraft(id, { ...proposal, lineItems: proposal.lineItems.map((item) => ({ ...item, amountUsd: 900 })) });

    const send = (body: unknown) =>
      sendRoute(new Request("http://localhost", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
    expect((await send({ mode: "email", message: "Here it is" })).status).toBe(422);
    const response = await send({ mode: "link" });
    expect(response.status).toBe(200);
    expect((await response.json()).url).toMatch(/\/p\/[^/]+$/);
  });
});
