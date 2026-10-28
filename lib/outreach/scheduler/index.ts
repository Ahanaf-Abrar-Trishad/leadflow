import { applyJitter } from "./jitter";
import { nextBusinessWindow, type BusinessHoursConfig } from "./businessHours";
import { effectiveDailyCap, type MailboxCapInfo } from "./dailyCap";
import { isDomainThrottled } from "./domainThrottle";

export interface ScheduleInput {
  now: Date;
  timezone: string;
  baseIntervalSeconds: number;
  businessHours: BusinessHoursConfig;
  mailbox: MailboxCapInfo;
  sentByMailboxToday: number;
  sentToDomainLast24h: number;
  domainThrottleLimit: number;
  random?: () => number;
}

export type ScheduleDecision =
  | { allowed: true; nextSendAt: Date }
  | { allowed: false; reason: "daily_cap_reached" | "domain_throttled"; retryAt: Date };

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Composes the four scheduling rules. Serialization (one in-flight send per
 * mailbox) is not this function's job — it is enforced by how the worker
 * selects rows to claim.
 */
export function computeNextSendAt(input: ScheduleInput): ScheduleDecision {
  const cap = effectiveDailyCap(input.mailbox, input.now);
  if (input.sentByMailboxToday >= cap) {
    return { allowed: false, reason: "daily_cap_reached", retryAt: new Date(input.now.getTime() + ONE_DAY_MS) };
  }

  if (isDomainThrottled(input.sentToDomainLast24h, input.domainThrottleLimit)) {
    return { allowed: false, reason: "domain_throttled", retryAt: new Date(input.now.getTime() + ONE_DAY_MS) };
  }

  const jitteredSeconds = applyJitter(input.baseIntervalSeconds, input.random);
  const earliest = new Date(input.now.getTime() + jitteredSeconds * 1000);
  const nextSendAt = nextBusinessWindow(earliest, input.timezone, input.businessHours);

  return { allowed: true, nextSendAt };
}
