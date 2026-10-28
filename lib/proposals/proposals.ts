import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, runAtomic } from "@/db/client";
import { contacts, deals, events, proposals, type ProposalLineItem, type ProposalSection } from "@/db/schema";
import { siteUrl } from "@/lib/outreach/mailboxes/googleClient";
import { DEFAULT_TERMS, endOfPacificDay, pacificDay, problemsBeforeSending, snapshotOf } from "./content";
import { signProposalToken, verifyProposalToken } from "./token";

/** A proposal operation the caller can show to the person as is. */
export class ProposalError extends Error {}

export type ProposalRow = typeof proposals.$inferSelect;

const DEFAULT_VALID_DAYS = 14;

function defaultValidUntil(now = new Date()): Date {
  return endOfPacificDay(pacificDay(new Date(now.getTime() + DEFAULT_VALID_DAYS * 86_400_000)));
}

export function proposalUrl(proposal: Pick<ProposalRow, "id" | "linkVersion">): string {
  return `${siteUrl().replace(/\/+$/, "")}/p/${signProposalToken(proposal.id, proposal.linkVersion)}`;
}

export async function getProposal(id: string): Promise<ProposalRow | null> {
  const [row] = await db.select().from(proposals).where(eq(proposals.id, id));
  return row ?? null;
}

/** The deal's live (draft or sent) proposal, if any. */
export async function getOpenProposalForDeal(dealId: string): Promise<ProposalRow | null> {
  const [row] = await db
    .select()
    .from(proposals)
    .where(and(eq(proposals.dealId, dealId), inArray(proposals.status, ["draft", "sent"])));
  return row ?? null;
}

/** Opens the deal's live proposal, creating an empty one if it has none. */
export async function openProposalForDeal(dealId: string): Promise<ProposalRow> {
  const existing = await getOpenProposalForDeal(dealId);
  if (existing) return existing;
  const [deal] = await db.select({ title: deals.title }).from(deals).where(eq(deals.id, dealId));
  if (!deal) throw new ProposalError("Deal not found.");
  const [created] = await db
    .insert(proposals)
    .values({
      dealId,
      title: `Proposal for ${deal.title}`,
      sections: [{ heading: "What we will do", body: "" }],
      lineItems: [{ description: "", amountUsd: null, billing: "one_time" }],
      terms: DEFAULT_TERMS,
      validUntil: defaultValidUntil(),
    })
    .returning();
  return created;
}

export interface ClaudeProposalDraft {
  title: string;
  summary: string;
  sections: ProposalSection[];
  /** Descriptions only; prices are always the operator's. */
  lineItems: { description: string; billing: "one_time" | "monthly" }[];
}

/**
 * Stores Claude's written proposal for a deal as a draft. Replaces an earlier
 * Claude draft only while no person has edited it; never touches a sent or
 * operator-edited proposal. Line items arrive without prices.
 */
export async function saveClaudeProposalDraft(dealId: string, draft: ClaudeProposalDraft): Promise<string> {
  const [deal] = await db.select({ id: deals.id, stage: deals.stage }).from(deals).where(eq(deals.id, dealId));
  if (!deal) throw new ProposalError("No deal with that id.");
  if (deal.stage === "won" || deal.stage === "lost") throw new ProposalError(`That deal is already ${deal.stage}.`);

  const content = {
    title: draft.title.trim(),
    summary: draft.summary.trim(),
    sections: draft.sections.map((section) => ({ heading: section.heading.trim(), body: section.body.trim() })),
    lineItems: draft.lineItems.map((item) => ({ description: item.description.trim(), amountUsd: null, billing: item.billing })),
    draftedBy: "claude",
    updatedAt: new Date(),
  };

  const existing = await getOpenProposalForDeal(dealId);
  if (existing) {
    if (existing.status !== "draft" || existing.editedByOperator) {
      throw new ProposalError("This deal's proposal has already been edited or sent by a person; leave it to them.");
    }
    await db.update(proposals).set(content).where(eq(proposals.id, existing.id));
    return existing.id;
  }
  const [created] = await db
    .insert(proposals)
    .values({ dealId, ...content, terms: DEFAULT_TERMS, validUntil: defaultValidUntil() })
    .returning({ id: proposals.id });
  return created.id;
}

export interface ProposalEdit {
  title: string;
  summary: string;
  sections: ProposalSection[];
  lineItems: ProposalLineItem[];
  terms: string;
  validUntil: Date | null;
}

export async function updateProposalDraft(id: string, edit: ProposalEdit): Promise<void> {
  // Named fields only: spreading `edit` would let any extra property on the
  // caller's object (status, linkVersion...) through to the row.
  const updated = await db
    .update(proposals)
    .set({
      title: edit.title,
      summary: edit.summary,
      sections: edit.sections,
      lineItems: edit.lineItems,
      terms: edit.terms,
      validUntil: edit.validUntil,
      editedByOperator: true,
      updatedAt: new Date(),
    })
    .where(and(eq(proposals.id, id), eq(proposals.status, "draft")))
    .returning({ id: proposals.id });
  if (updated.length === 0) throw new ProposalError("Only a draft proposal can be edited. Move it back to draft first.");
}

/** Makes the public link live and moves the deal to the Proposal stage. */
export async function markProposalSent(id: string): Promise<ProposalRow> {
  const proposal = await getProposal(id);
  if (!proposal) throw new ProposalError("Proposal not found.");
  if (proposal.status === "sent") return proposal;
  if (proposal.status !== "draft") throw new ProposalError(`This proposal is ${proposal.status}.`);
  const problems = problemsBeforeSending(proposal);
  if (problems.length > 0) throw new ProposalError(problems.join(" "));

  return runAtomic(async (tx) => {
    const now = new Date();
    const [sent] = await tx
      .update(proposals)
      .set({ status: "sent", sentAt: proposal.sentAt ?? now, updatedAt: now })
      .where(eq(proposals.id, id))
      .returning();
    await tx
      .update(deals)
      .set({ stage: "proposal", stageChangedAt: now, updatedAt: now })
      .where(and(eq(deals.id, proposal.dealId), inArray(deals.stage, ["replied", "call_booked"])));
    return sent;
  });
}

/** Back to editing (sent -> draft) or withdrawn for good. Either way every
 * link already handed out stops working. */
export async function revokeProposal(id: string, to: "draft" | "withdrawn"): Promise<void> {
  const allowedFrom = to === "draft" ? ["sent"] : ["draft", "sent"];
  const updated = await db
    .update(proposals)
    .set({ status: to, linkVersion: sql`${proposals.linkVersion} + 1`, updatedAt: new Date() })
    .where(and(eq(proposals.id, id), inArray(proposals.status, allowedFrom)))
    .returning({ id: proposals.id });
  if (updated.length === 0) throw new ProposalError("That change is not possible for this proposal anymore.");
}

/** Resolves a public link to its proposal; null for a forged, revoked or
 * unknown link. A draft or withdrawn proposal is not shown to the client. */
export async function getProposalByToken(token: string): Promise<ProposalRow | null> {
  const parsed = verifyProposalToken(token);
  if (!parsed) return null;
  const proposal = await getProposal(parsed.proposalId);
  if (!proposal || proposal.linkVersion !== parsed.linkVersion) return null;
  if (proposal.status === "draft" || proposal.status === "withdrawn") return null;
  return proposal;
}

export async function recordProposalView(id: string): Promise<void> {
  const now = new Date();
  await db
    .update(proposals)
    .set({
      viewCount: sql`${proposals.viewCount} + 1`,
      firstViewedAt: sql`coalesce(${proposals.firstViewedAt}, ${now.toISOString()}::timestamptz)`,
      lastViewedAt: now,
    })
    .where(and(eq(proposals.id, id), eq(proposals.status, "sent")));
}

export interface Signature {
  name: string;
  email: string;
  agreed: boolean;
  ip: string | null;
  userAgent: string | null;
}

/**
 * The client's electronic signature. Records who, when, from where, and an
 * exact copy of what they agreed to, then marks the deal won. Only a sent,
 * unexpired proposal can be accepted, and only once.
 */
export async function acceptProposal(id: string, signature: Signature, now: Date = new Date()): Promise<void> {
  if (!signature.agreed) throw new ProposalError("Please tick the box to agree before accepting.");
  const name = signature.name.trim();
  if (name.length < 2) throw new ProposalError("Please type your full name.");

  await runAtomic(async (tx) => {
    const [proposal] = await tx.select().from(proposals).where(eq(proposals.id, id));
    if (!proposal || proposal.status !== "sent") throw new ProposalError("This proposal can no longer be accepted.");
    if (proposal.validUntil && proposal.validUntil <= now) {
      throw new ProposalError("This proposal has expired. Please ask us for an updated one.");
    }
    const accepted = await tx
      .update(proposals)
      .set({
        status: "accepted",
        acceptedAt: now,
        signerName: name,
        signerEmail: signature.email.trim().toLowerCase(),
        signerIp: signature.ip,
        signerUserAgent: signature.userAgent?.slice(0, 500) ?? null,
        signedSnapshot: snapshotOf(proposal),
        updatedAt: now,
      })
      // Conditional on status, so a double-submitted form signs only once.
      .where(and(eq(proposals.id, id), eq(proposals.status, "sent")))
      .returning({ id: proposals.id });
    if (accepted.length === 0) throw new ProposalError("This proposal can no longer be accepted.");
    await tx
      .update(deals)
      .set({ stage: "won", stageChangedAt: now, lostReason: null, updatedAt: now })
      .where(eq(deals.id, proposal.dealId));
    await tx.insert(events).values({
      type: "proposal_accepted",
      payload: { proposalId: id, dealId: proposal.dealId, signerName: name, signerEmail: signature.email },
    });
  });
}

export async function declineProposal(id: string, reason: string): Promise<void> {
  const now = new Date();
  await runAtomic(async (tx) => {
    const [proposal] = await tx.select().from(proposals).where(eq(proposals.id, id));
    if (!proposal || proposal.status !== "sent") throw new ProposalError("This proposal can no longer be declined.");
    await tx
      .update(proposals)
      .set({ status: "declined", declinedAt: now, declineReason: reason.trim().slice(0, 1000) || null, updatedAt: now })
      .where(and(eq(proposals.id, id), eq(proposals.status, "sent")));
    await tx.insert(events).values({ type: "proposal_declined", payload: { proposalId: id, dealId: proposal.dealId } });
  });
}

export async function listProposals() {
  return db
    .select({
      id: proposals.id,
      title: proposals.title,
      status: proposals.status,
      lineItems: proposals.lineItems,
      draftedBy: proposals.draftedBy,
      sentAt: proposals.sentAt,
      viewCount: proposals.viewCount,
      acceptedAt: proposals.acceptedAt,
      signerName: proposals.signerName,
      updatedAt: proposals.updatedAt,
      dealTitle: deals.title,
      contactEmail: contacts.email,
    })
    .from(proposals)
    .innerJoin(deals, eq(deals.id, proposals.dealId))
    .innerJoin(contacts, eq(contacts.id, deals.contactId))
    .orderBy(desc(proposals.updatedAt));
}

/** Deals waiting on a call or a proposal that have no proposal yet - the
 * ones Claude can draft for. */
export async function listDealsNeedingProposal(limit: number) {
  const rows = await db
    .select({ id: deals.id, title: deals.title, stage: deals.stage, notes: deals.notes, contactEmail: contacts.email })
    .from(deals)
    .innerJoin(contacts, eq(contacts.id, deals.contactId))
    .where(
      and(
        inArray(deals.stage, ["call_booked", "proposal"]),
        sql`not exists (select 1 from ${proposals} where ${proposals.dealId} = ${deals.id} and ${proposals.status} in ('draft', 'sent', 'accepted'))`,
      ),
    )
    .orderBy(desc(deals.updatedAt))
    .limit(limit);
  return rows;
}
