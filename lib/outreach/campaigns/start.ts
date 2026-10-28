import { computeNextSendAt, type ScheduleInput } from "@/lib/outreach/scheduler";
import { effectiveDailyCap, type MailboxCapInfo } from "@/lib/outreach/scheduler/dailyCap";
import { extractDomain } from "@/lib/outreach/scheduler/domainThrottle";

export interface EnrollmentToSchedule {
  id: string;
  email: string;
  timezone: string;
}

export interface PoolMailbox extends MailboxCapInfo {
  id: string;
  alreadySentToday: number;
}

export interface ScheduleCampaignInput {
  now: Date;
  baseIntervalSeconds: number;
  businessHours: { startHour: number; endHour: number; days: number[] };
  /** Eligible (health: "healthy") pool mailboxes only - callers filter out
   * paused ones before calling this. */
  mailboxes: PoolMailbox[];
  domainThrottleLimit: number;
  enrollments: EnrollmentToSchedule[];
}

export interface ScheduledEnrollment {
  id: string;
  mailboxId: string;
  nextSendAt: Date;
}

/**
 * Assigns each pending enrollment to whichever pool mailbox is currently
 * least loaded (lowest sent/effectiveCap ratio), then walks the scheduler
 * forward one contact at a time against that mailbox's own cap/domain-
 * throttle/business-hours rules, so the rules apply across the whole
 * batch, not just per contact. The assignment is sticky: it becomes
 * `enrollments.mailboxId`, and every later step in that enrollment's
 * sequence keeps using it (threading requires the same identity).
 */
export function scheduleCampaignStart(input: ScheduleCampaignInput): ScheduledEnrollment[] {
  if (input.mailboxes.length === 0) {
    throw new Error("No eligible mailboxes in the campaign's pool.");
  }

  const mailboxCounts = new Map(input.mailboxes.map((m) => [m.id, m.alreadySentToday]));
  const domainCounts = new Map<string, number>(); // key: `${mailboxId}:${domain}`
  let cursor = input.now;
  const scheduled: ScheduledEnrollment[] = [];

  for (const enrollment of input.enrollments) {
    const pick = pickLeastLoadedMailbox(input.mailboxes, mailboxCounts, cursor);
    const domain = extractDomain(enrollment.email);
    const domainKey = `${pick.id}:${domain}`;
    const domainCount = domainCounts.get(domainKey) ?? 0;
    const mailboxCount = mailboxCounts.get(pick.id) ?? 0;

    const decision = computeNextSendAt({
      now: cursor,
      timezone: enrollment.timezone,
      baseIntervalSeconds: input.baseIntervalSeconds,
      businessHours: input.businessHours,
      mailbox: pick,
      sentByMailboxToday: mailboxCount,
      sentToDomainLast24h: domainCount,
      domainThrottleLimit: input.domainThrottleLimit,
    } satisfies ScheduleInput);

    if (decision.allowed) {
      scheduled.push({ id: enrollment.id, mailboxId: pick.id, nextSendAt: decision.nextSendAt });
      cursor = decision.nextSendAt;
      mailboxCounts.set(pick.id, mailboxCount + 1);
      domainCounts.set(domainKey, domainCount + 1);
    } else {
      cursor = decision.retryAt;
      for (const m of input.mailboxes) mailboxCounts.set(m.id, 0);
      domainCounts.clear();
      scheduled.push({ id: enrollment.id, mailboxId: pick.id, nextSendAt: decision.retryAt });
    }
  }

  return scheduled;
}

function pickLeastLoadedMailbox(mailboxes: PoolMailbox[], counts: Map<string, number>, now: Date): PoolMailbox {
  let best = mailboxes[0];
  let bestRatio = (counts.get(best.id) ?? 0) / effectiveDailyCap(best, now);

  for (const mailbox of mailboxes.slice(1)) {
    const ratio = (counts.get(mailbox.id) ?? 0) / effectiveDailyCap(mailbox, now);
    if (ratio < bestRatio) {
      best = mailbox;
      bestRatio = ratio;
    }
  }

  return best;
}
