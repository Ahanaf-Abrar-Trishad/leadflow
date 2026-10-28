import { effectiveDailyCap } from "@/lib/outreach/scheduler/dailyCap";

describe("effectiveDailyCap", () => {
  const now = new Date("2026-09-03T12:00:00Z");

  it("returns the mailbox cap directly when there is no ramp", () => {
    expect(effectiveDailyCap({ dailyCap: 50, rampStartedAt: null }, now)).toBe(50);
  });
  it("starts the ramp at 15 on day zero", () => {
    expect(effectiveDailyCap({ dailyCap: 50, rampStartedAt: now }, now)).toBe(15);
  });
  it("climbs by 5 per elapsed day", () => {
    const rampStartedAt = new Date("2026-08-31T12:00:00Z"); // 3 days earlier
    expect(effectiveDailyCap({ dailyCap: 50, rampStartedAt }, now)).toBe(30);
  });
  it("never exceeds the mailbox's configured cap", () => {
    const rampStartedAt = new Date("2026-01-01T12:00:00Z");
    expect(effectiveDailyCap({ dailyCap: 20, rampStartedAt }, now)).toBe(20);
  });
});
