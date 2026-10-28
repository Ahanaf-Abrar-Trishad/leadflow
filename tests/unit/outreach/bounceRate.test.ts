import { computeBounceRate } from "@/lib/outreach/deliverability/bounceRate";

function samples(bounced: number, other: number): { enrollmentStatus: string }[] {
  return [
    ...Array.from({ length: bounced }, () => ({ enrollmentStatus: "bounced" })),
    ...Array.from({ length: other }, () => ({ enrollmentStatus: "completed" })),
  ];
}

describe("computeBounceRate", () => {
  it("returns null under the 20-sample minimum, even at a high bounce fraction", () => {
    expect(computeBounceRate(samples(5, 5))).toBeNull(); // 10 samples, 50% bounced
  });

  it("computes the bounced fraction of a sample at or above the minimum", () => {
    const result = computeBounceRate(samples(2, 48)); // 50 samples, 4%
    expect(result).toEqual({ rate: 0.04, sampleSize: 50 });
  });

  it("treats every non-bounced status as a non-bounce, including still-active enrollments", () => {
    const result = computeBounceRate([
      ...samples(1, 0),
      ...Array.from({ length: 24 }, () => ({ enrollmentStatus: "active" })),
    ]);
    expect(result).toEqual({ rate: 1 / 25, sampleSize: 25 });
  });
});
