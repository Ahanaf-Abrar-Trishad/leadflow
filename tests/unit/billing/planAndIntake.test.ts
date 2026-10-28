/** @jest-environment node */
import { balanceUsd, invoicesForSignedProposal } from "@/lib/billing/plan";
import { formatCents } from "@/lib/billing/money";
import { cleanIntakeAnswers, INTAKE_ANSWER_MAX_LENGTH, OnboardingError } from "@/lib/onboarding/content";

const snapshot = (depositPercent: number, items: [number, "one_time" | "monthly"][]) => ({
  title: "Website refresh",
  summary: "",
  sections: [],
  terms: "",
  validUntil: null,
  depositPercent,
  lineItems: items.map(([amountUsd, billing], index) => ({ description: `Item ${index}`, amountUsd, billing })),
});

describe("invoicesForSignedProposal", () => {
  it("bills the deposit and the first month on acceptance, in cents", () => {
    expect(invoicesForSignedProposal(snapshot(50, [[4200, "one_time"], [900, "one_time"], [650, "monthly"]]))).toEqual([
      { kind: "deposit", description: "Website refresh - 50% deposit", amountCents: 255_000 },
      { kind: "monthly", description: "Website refresh - monthly", amountCents: 65_000 },
    ]);
  });

  it("bills everything up front at 100%, and nothing one-time at 0%", () => {
    expect(invoicesForSignedProposal(snapshot(100, [[5000, "one_time"]]))).toEqual([
      { kind: "full", description: "Website refresh - payment in full", amountCents: 500_000 },
    ]);
    expect(invoicesForSignedProposal(snapshot(0, [[5000, "one_time"]]))).toEqual([]);
  });

  it("leaves exactly the rest of the one-time total as the balance", () => {
    expect(balanceUsd(snapshot(50, [[4200, "one_time"], [900, "one_time"], [650, "monthly"]]))).toBe(2550);
    expect(balanceUsd(snapshot(33, [[999, "one_time"]]))).toBe(669);
    expect(balanceUsd(snapshot(100, [[999, "one_time"]]))).toBe(0);
  });

  it("formats cents as dollars", () => {
    expect(formatCents(255_000)).toBe("$2,550.00");
  });
});

describe("cleanIntakeAnswers", () => {
  it("keeps known questions only, trimmed and capped", () => {
    const answers = cleanIntakeAnswers({
      contact_name: "  Dr. Lee ",
      goals: "More families booking online",
      password: "hunter2",
      brand: "x".repeat(INTAKE_ANSWER_MAX_LENGTH + 50),
    });
    expect(answers.contact_name).toBe("Dr. Lee");
    expect(answers).not.toHaveProperty("password");
    expect(answers.brand).toHaveLength(INTAKE_ANSWER_MAX_LENGTH);
  });

  it("requires the required questions", () => {
    expect(() => cleanIntakeAnswers({ contact_name: "Dr. Lee" })).toThrow(OnboardingError);
  });
});
