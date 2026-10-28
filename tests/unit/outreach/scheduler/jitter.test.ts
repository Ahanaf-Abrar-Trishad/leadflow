import { applyJitter } from "@/lib/outreach/scheduler/jitter";

describe("applyJitter", () => {
  it("applies -40% at random()=0", () => {
    expect(applyJitter(60, () => 0)).toBe(36);
  });
  it("applies +40% at random()=1", () => {
    expect(applyJitter(60, () => 1)).toBe(84);
  });
  it("leaves the base unchanged at random()=0.5", () => {
    expect(applyJitter(60, () => 0.5)).toBe(60);
  });
  it("never returns less than 1 second", () => {
    expect(applyJitter(1, () => 0)).toBeGreaterThanOrEqual(1);
  });
});
