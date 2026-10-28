export interface BounceRateSample {
  enrollmentStatus: string;
}

export interface BounceRateResult {
  rate: number;
  sampleSize: number;
}

const MIN_SAMPLE_SIZE = 20;

/**
 * Computes the hard-bounce fraction of a trailing window of sends, already
 * fetched by the caller (see lib/outreach/scheduler/sendCounts.ts's sibling
 * queries for the DB-touching half of this). Returns null under the
 * minimum sample size - not enough signal to act on yet, which matters
 * most for a mailbox still ramping up (few sends so far).
 */
export function computeBounceRate(samples: BounceRateSample[]): BounceRateResult | null {
  if (samples.length < MIN_SAMPLE_SIZE) return null;
  const bounced = samples.filter((s) => s.enrollmentStatus === "bounced").length;
  return { rate: bounced / samples.length, sampleSize: samples.length };
}
