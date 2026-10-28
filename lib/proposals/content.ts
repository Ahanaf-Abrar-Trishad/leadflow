import type { ProposalLineItem, ProposalSection, ProposalSnapshot } from "@/db/schema";

/** Starting terms for a new proposal; the operator edits them per proposal. */
export const DEFAULT_TERMS = `Payment: one-time fees are invoiced 50% on acceptance and 50% on completion. Monthly fees are billed in advance and can be cancelled with 30 days' written notice.
Scope: work not listed in this proposal is quoted separately before it starts.
Ownership: on full payment, the client owns the website content and design delivered.
Validity: this proposal can be accepted until the date shown.`;

export const MAX_SECTIONS = 8;
export const MAX_LINE_ITEMS = 12;

export interface ProposalTotals {
  oneTime: number;
  monthly: number;
}

export function proposalTotals(lineItems: ProposalLineItem[]): ProposalTotals {
  return lineItems.reduce(
    (totals, item) => {
      const amount = item.amountUsd ?? 0;
      if (item.billing === "monthly") totals.monthly += amount;
      else totals.oneTime += amount;
      return totals;
    },
    { oneTime: 0, monthly: 0 },
  );
}

/** Everything that must be true before a client can see the proposal. */
export function problemsBeforeSending(proposal: {
  title: string;
  sections: ProposalSection[];
  lineItems: ProposalLineItem[];
  validUntil: Date | null;
}, now: Date = new Date()): string[] {
  const problems: string[] = [];
  if (!proposal.title.trim()) problems.push("Add a title.");
  if (!proposal.sections.some((section) => section.body.trim())) problems.push("Add at least one section with text.");
  if (proposal.lineItems.length === 0) problems.push("Add at least one line item.");
  if (proposal.lineItems.some((item) => !item.description.trim())) problems.push("Every line item needs a description.");
  if (proposal.lineItems.some((item) => item.amountUsd === null || item.amountUsd <= 0)) {
    problems.push("Set a price on every line item.");
  }
  if (proposal.validUntil && proposal.validUntil <= now) problems.push("The valid-until date has passed.");
  return problems;
}

export function snapshotOf(proposal: {
  title: string;
  summary: string;
  sections: ProposalSection[];
  lineItems: ProposalLineItem[];
  terms: string;
  validUntil: Date | null;
}): ProposalSnapshot {
  return {
    title: proposal.title,
    summary: proposal.summary,
    sections: proposal.sections,
    lineItems: proposal.lineItems,
    terms: proposal.terms,
    validUntil: proposal.validUntil?.toISOString() ?? null,
  };
}

/** "2026-11-12" -> the end of that day in US Pacific time, the latest of
 * the continental US time zones, so a client anywhere in the lower 48 has
 * the whole day. */
export function endOfPacificDay(date: string): Date {
  return new Date(`${date}T23:59:59-08:00`);
}

/** The Pacific calendar day of a stored valid-until, as "yyyy-mm-dd". */
export function pacificDay(value: Date): string {
  return value.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

export const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
