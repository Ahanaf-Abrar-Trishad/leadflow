/** @jest-environment node */
import crypto from "node:crypto";
import { signProposalToken, verifyProposalToken } from "@/lib/proposals/token";
import { depositUsd, endOfPacificDay, pacificDay, problemsBeforeSending, proposalTotals } from "@/lib/proposals/content";

const KEY = crypto.randomBytes(32);
const ID = "3f6c2a1e-1111-4222-8333-944455556666";

describe("proposal link tokens", () => {
  it("round-trips the id and link version", () => {
    expect(verifyProposalToken(signProposalToken(ID, 3, KEY), KEY)).toEqual({ proposalId: ID, linkVersion: 3 });
  });

  it("rejects a tampered version, a different key and garbage", () => {
    const token = signProposalToken(ID, 1, KEY);
    const [, signature] = token.split(".");
    const forged = `${Buffer.from(`${ID}:2`).toString("base64url")}.${signature}`;
    expect(verifyProposalToken(forged, KEY)).toBeNull();
    expect(verifyProposalToken(token, crypto.randomBytes(32))).toBeNull();
    expect(verifyProposalToken("not-a-token", KEY)).toBeNull();
  });
});

describe("proposal content", () => {
  const base = {
    title: "Website refresh",
    sections: [{ heading: "Plan", body: "New site." }],
    lineItems: [
      { description: "Redesign", amountUsd: 4000, billing: "one_time" as const },
      { description: "Local SEO", amountUsd: 600, billing: "monthly" as const },
    ],
    validUntil: null,
    depositPercent: 50,
  };

  it("totals one-time and monthly separately, and works out the deposit", () => {
    expect(proposalTotals(base.lineItems)).toEqual({ oneTime: 4000, monthly: 600 });
    expect(depositUsd(5100, 50)).toBe(2550);
    expect(depositUsd(999, 33)).toBe(330);
  });

  it("rejects a deposit outside 0-100%", () => {
    expect(problemsBeforeSending({ ...base, depositPercent: 120 })).toContain("The deposit must be between 0% and 100%.");
  });

  it("will not send with an unpriced item, an empty plan or an expired date", () => {
    expect(problemsBeforeSending(base)).toEqual([]);
    expect(problemsBeforeSending({ ...base, lineItems: [{ description: "Redesign", amountUsd: null, billing: "one_time" }] })).toEqual([
      "Set a price on every line item.",
    ]);
    expect(problemsBeforeSending({ ...base, sections: [{ heading: "Plan", body: " " }] })).toContain("Add at least one section with text.");
    expect(problemsBeforeSending({ ...base, validUntil: new Date("2020-01-01") })).toContain("The valid-until date has passed.");
  });

  it("treats a valid-until day as the end of that day in Pacific time, and reads it back as the same day", () => {
    const end = endOfPacificDay("2026-11-12");
    expect(end.toISOString()).toBe("2026-11-13T07:59:59.000Z");
    expect(pacificDay(end)).toBe("2026-11-12");
  });
});
