import { computeNextSendAt } from "@/lib/outreach/scheduler";

const BUSINESS_HOURS = { startHour: 9, endHour: 16, days: [1, 2, 3, 4, 5] }; // Mon-Fri

describe("computeNextSendAt", () => {
  const baseInput = {
    now: new Date("2026-09-03T10:00:00Z"), // Thursday, inside business hours
    timezone: "UTC",
    baseIntervalSeconds: 60,
    businessHours: BUSINESS_HOURS,
    mailbox: { dailyCap: 50, rampStartedAt: null },
    sentByMailboxToday: 0,
    sentToDomainLast24h: 0,
    domainThrottleLimit: 3,
    random: () => 0.5, // no jitter
  };

  it("schedules the jittered interval inside business hours when nothing is blocked", () => {
    expect(computeNextSendAt(baseInput)).toEqual({
      allowed: true,
      nextSendAt: new Date("2026-09-03T10:01:00Z"),
    });
  });

  it("blocks and retries a day later once the mailbox's daily cap is reached", () => {
    expect(computeNextSendAt({ ...baseInput, sentByMailboxToday: 50 })).toEqual({
      allowed: false,
      reason: "daily_cap_reached",
      retryAt: new Date("2026-09-04T10:00:00Z"),
    });
  });

  it("blocks and retries a day later once the domain throttle is reached", () => {
    expect(computeNextSendAt({ ...baseInput, sentToDomainLast24h: 3 })).toEqual({
      allowed: false,
      reason: "domain_throttled",
      retryAt: new Date("2026-09-04T10:00:00Z"),
    });
  });
});
