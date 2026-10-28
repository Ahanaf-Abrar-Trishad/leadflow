import { describeHeartbeat } from "@/lib/outreach/dashboard/queries";

describe("describeHeartbeat", () => {
  const now = new Date("2026-09-12T12:00:00Z");

  it("is unhealthy with no data when no row exists yet", () => {
    const result = describeHeartbeat(undefined, now, 15_000, "worker");
    expect(result).toEqual({ process: "worker", lastRunAt: null, healthy: false, secondsAgo: null });
  });

  it("is healthy when the last run was within 3x the expected interval", () => {
    const lastRunAt = new Date(now.getTime() - 20_000); // 20s ago, 3x15s=45s
    const result = describeHeartbeat({ process: "worker", lastRunAt }, now, 15_000, "worker");
    expect(result.healthy).toBe(true);
    expect(result.secondsAgo).toBe(20);
  });

  it("is unhealthy once the last run is older than 3x the expected interval", () => {
    const lastRunAt = new Date(now.getTime() - 50_000); // 50s ago, 3x15s=45s
    const result = describeHeartbeat({ process: "worker", lastRunAt }, now, 15_000, "worker");
    expect(result.healthy).toBe(false);
  });
});
