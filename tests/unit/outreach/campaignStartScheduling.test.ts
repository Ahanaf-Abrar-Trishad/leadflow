import { scheduleCampaignStart } from "@/lib/outreach/campaigns/start";

const BUSINESS_HOURS = { startHour: 0, endHour: 24, days: [0, 1, 2, 3, 4, 5, 6] };

describe("scheduleCampaignStart", () => {
  it("staggers sends across contacts using the jittered interval", () => {
    const now = new Date("2026-09-03T10:00:00Z");
    const result = scheduleCampaignStart({
      now,
      baseIntervalSeconds: 60,
      businessHours: BUSINESS_HOURS,
      mailboxes: [{ id: "m1", dailyCap: 50, rampStartedAt: null, alreadySentToday: 0 }],
      domainThrottleLimit: 10,
      enrollments: [
        { id: "a", email: "a@acme.com", timezone: "UTC" },
        { id: "b", email: "b@beta.com", timezone: "UTC" },
      ],
    });

    expect(result[0].nextSendAt.getTime()).toBeGreaterThan(now.getTime());
    expect(result[1].nextSendAt.getTime()).toBeGreaterThan(result[0].nextSendAt.getTime());
    expect(result[0].mailboxId).toBe("m1");
    expect(result[1].mailboxId).toBe("m1");
  });

  it("pushes remaining contacts to the next day once the mailbox's daily cap is reached", () => {
    const now = new Date("2026-09-03T10:00:00Z");
    const result = scheduleCampaignStart({
      now,
      baseIntervalSeconds: 60,
      businessHours: BUSINESS_HOURS,
      mailboxes: [{ id: "m1", dailyCap: 1, rampStartedAt: null, alreadySentToday: 0 }],
      domainThrottleLimit: 10,
      enrollments: [
        { id: "a", email: "a@acme.com", timezone: "UTC" },
        { id: "b", email: "b@beta.com", timezone: "UTC" },
      ],
    });

    expect(result[0].nextSendAt.getUTCDate()).toBe(3);
    expect(result[1].nextSendAt.getUTCDate()).toBe(4);
  });

  it("throttles a second contact at the same domain within the limit", () => {
    const now = new Date("2026-09-03T10:00:00Z");
    const result = scheduleCampaignStart({
      now,
      baseIntervalSeconds: 60,
      businessHours: BUSINESS_HOURS,
      mailboxes: [{ id: "m1", dailyCap: 50, rampStartedAt: null, alreadySentToday: 0 }],
      domainThrottleLimit: 1,
      enrollments: [
        { id: "a", email: "a@acme.com", timezone: "UTC" },
        { id: "b", email: "b2@acme.com", timezone: "UTC" },
      ],
    });

    expect(result[0].nextSendAt.getUTCDate()).toBe(3);
    expect(result[1].nextSendAt.getUTCDate()).toBe(4);
  });

  it("assigns an enrollment to whichever pool mailbox is currently least loaded", () => {
    const now = new Date("2026-09-03T10:00:00Z");
    const result = scheduleCampaignStart({
      now,
      baseIntervalSeconds: 60,
      businessHours: BUSINESS_HOURS,
      mailboxes: [
        { id: "loaded", dailyCap: 50, rampStartedAt: null, alreadySentToday: 40 }, // 80% loaded
        { id: "fresh", dailyCap: 50, rampStartedAt: null, alreadySentToday: 0 }, // 0% loaded
      ],
      domainThrottleLimit: 10,
      enrollments: [{ id: "a", email: "a@acme.com", timezone: "UTC" }],
    });

    expect(result[0].mailboxId).toBe("fresh");
  });

  it("balances successive enrollments across equally-loaded pool mailboxes as counts diverge", () => {
    const now = new Date("2026-09-03T10:00:00Z");
    const result = scheduleCampaignStart({
      now,
      baseIntervalSeconds: 60,
      businessHours: BUSINESS_HOURS,
      mailboxes: [
        { id: "a", dailyCap: 50, rampStartedAt: null, alreadySentToday: 0 },
        { id: "b", dailyCap: 50, rampStartedAt: null, alreadySentToday: 0 },
      ],
      domainThrottleLimit: 10,
      enrollments: [
        { id: "e1", email: "e1@acme.com", timezone: "UTC" },
        { id: "e2", email: "e2@beta.com", timezone: "UTC" },
        { id: "e3", email: "e3@gamma.com", timezone: "UTC" },
      ],
    });

    // Ties break toward the first pool mailbox; once counts diverge the
    // lower one wins - so this alternates a, b, a.
    expect(result.map((r) => r.mailboxId)).toEqual(["a", "b", "a"]);
  });

  it("throws when the pool is empty", () => {
    const now = new Date("2026-09-03T10:00:00Z");
    expect(() =>
      scheduleCampaignStart({
        now,
        baseIntervalSeconds: 60,
        businessHours: BUSINESS_HOURS,
        mailboxes: [],
        domainThrottleLimit: 10,
        enrollments: [{ id: "a", email: "a@acme.com", timezone: "UTC" }],
      }),
    ).toThrow();
  });
});
