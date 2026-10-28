const RAMP_BASE = 15;
const RAMP_STEP_PER_DAY = 5;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface MailboxCapInfo {
  dailyCap: number;
  rampStartedAt: Date | null;
}

export function effectiveDailyCap(mailbox: MailboxCapInfo, now: Date): number {
  if (!mailbox.rampStartedAt) return mailbox.dailyCap;
  const daysSinceRampStart = Math.max(
    0,
    Math.floor((now.getTime() - mailbox.rampStartedAt.getTime()) / MS_PER_DAY),
  );
  const rampedCap = RAMP_BASE + RAMP_STEP_PER_DAY * daysSinceRampStart;
  return Math.min(mailbox.dailyCap, rampedCap);
}
