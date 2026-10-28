/** @jest-environment node */
import { DraftError, validateIcebreaker } from "@/lib/ai/icebreaker";

describe("validateIcebreaker", () => {
  it("collapses whitespace", () => {
    expect(validateIcebreaker("  Saw your 400+ reviews\n on Google -  impressive for a 3-chair practice. ")).toBe(
      "Saw your 400+ reviews on Google - impressive for a 3-chair practice.",
    );
  });

  it("rejects lines that are too short, too long, or contain braces", () => {
    expect(() => validateIcebreaker("Hi there")).toThrow(DraftError);
    expect(() => validateIcebreaker("x".repeat(401))).toThrow(DraftError);
    expect(() => validateIcebreaker("Loved your {{company}} homepage and its menu")).toThrow(/\{ or \}/);
  });
});
