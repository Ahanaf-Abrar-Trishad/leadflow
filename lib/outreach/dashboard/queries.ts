import { count, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { campaigns, enrollments, mailboxes, messages, workerHeartbeats } from "@/db/schema";
import { computeBounceRate, type BounceRateResult } from "@/lib/outreach/deliverability/bounceRate";
import { countSentByMailboxToday } from "@/lib/outreach/scheduler/sendCounts";

const TRAILING_WINDOW = 50;

export interface MailboxHealthRow {
  id: string;
  fromName: string;
  fromEmail: string;
  provider: string;
  health: string;
  dailyCap: number;
  sentToday: number;
  bounceRate: BounceRateResult | null;
}

export async function getMailboxHealthRows(now: Date = new Date()): Promise<MailboxHealthRow[]> {
  const rows = await db
    .select({
      id: mailboxes.id,
      fromName: mailboxes.fromName,
      fromEmail: mailboxes.fromEmail,
      provider: mailboxes.provider,
      health: mailboxes.health,
      dailyCap: mailboxes.dailyCap,
    })
    .from(mailboxes);

  return Promise.all(
    rows.map(async (mailbox) => {
      const [sentToday, trailing] = await Promise.all([
        countSentByMailboxToday(mailbox.id, now),
        db
          .select({ enrollmentStatus: enrollments.status })
          .from(messages)
          .innerJoin(enrollments, eq(enrollments.id, messages.enrollmentId))
          .where(eq(enrollments.mailboxId, mailbox.id))
          .orderBy(desc(messages.sentAt))
          .limit(TRAILING_WINDOW),
      ]);

      return { ...mailbox, sentToday, bounceRate: computeBounceRate(trailing) };
    }),
  );
}

export interface CampaignPerformanceRow {
  id: string;
  name: string;
  status: string;
  enrolled: number;
  replied: number;
  bounced: number;
  completed: number;
  active: number;
  /** null when no enrollment has replied, bounced, or completed yet - still
   * mid-sequence enrollments haven't had their chance to count either way. */
  replyRate: number | null;
}

export async function getCampaignPerformanceRows(): Promise<CampaignPerformanceRow[]> {
  const campaignRows = await db
    .select({ id: campaigns.id, name: campaigns.name, status: campaigns.status })
    .from(campaigns)
    .orderBy(desc(campaigns.createdAt));

  // One grouped query for every campaign's status breakdown at once,
  // rather than one query per campaign.
  const statusCounts = await db
    .select({ campaignId: enrollments.campaignId, status: enrollments.status, count: count() })
    .from(enrollments)
    .groupBy(enrollments.campaignId, enrollments.status);

  return campaignRows.map((campaign) => {
    const counts = statusCounts.filter((c) => c.campaignId === campaign.id);
    const byStatus = (status: string) => counts.find((c) => c.status === status)?.count ?? 0;
    const replied = byStatus("replied");
    const bounced = byStatus("bounced");
    const completed = byStatus("completed");
    const denominator = replied + bounced + completed;

    return {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      enrolled: counts.reduce((sum, c) => sum + c.count, 0),
      replied,
      bounced,
      completed,
      active: byStatus("active"),
      replyRate: denominator > 0 ? replied / denominator : null,
    };
  });
}

const TREND_DAYS = 14;

/** One count per day for the trailing `days` days (oldest first), zero-filled
 * for days with no sends - backs the dashboard's sent-volume sparkline. */
export async function getSentVolumeTrend(days: number = TREND_DAYS, now: Date = new Date()): Promise<number[]> {
  const since = new Date(now);
  since.setUTCDate(since.getUTCDate() - (days - 1));
  since.setUTCHours(0, 0, 0, 0);

  const rows = await db
    .select({
      day: sql<string>`date_trunc('day', ${messages.sentAt})::date`,
      count: count(),
    })
    .from(messages)
    .where(gte(messages.sentAt, since))
    .groupBy(sql`date_trunc('day', ${messages.sentAt})::date`);

  const byDay = new Map(rows.map((r) => [r.day, r.count]));

  return Array.from({ length: days }, (_, i) => {
    const day = new Date(since);
    day.setUTCDate(day.getUTCDate() + i);
    const key = day.toISOString().slice(0, 10);
    return byDay.get(key) ?? 0;
  });
}

// Mirrors worker/tick.ts's TICK_INTERVAL_MS and worker/poller.ts's
// POLL_INTERVAL_MS - duplicated as plain constants rather than imported,
// since importing those modules here would pull their heavy dependencies
// (nodemailer, googleapis, imapflow) into the web app's bundle.
const WORKER_INTERVAL_MS = 15_000;
const POLLER_INTERVAL_MS = 3 * 60 * 1000;
const UNHEALTHY_MULTIPLIER = 3;

export interface HeartbeatStatus {
  process: string;
  lastRunAt: Date | null;
  healthy: boolean;
  secondsAgo: number | null;
}

export function describeHeartbeat(
  row: { process: string; lastRunAt: Date } | undefined,
  now: Date,
  expectedIntervalMs: number,
  processName: string,
): HeartbeatStatus {
  if (!row) return { process: processName, lastRunAt: null, healthy: false, secondsAgo: null };
  const ageMs = now.getTime() - row.lastRunAt.getTime();
  return {
    process: processName,
    lastRunAt: row.lastRunAt,
    healthy: ageMs <= expectedIntervalMs * UNHEALTHY_MULTIPLIER,
    secondsAgo: Math.round(ageMs / 1000),
  };
}

export async function getWorkerHeartbeats(now: Date = new Date()): Promise<{ worker: HeartbeatStatus; poller: HeartbeatStatus }> {
  const rows = await db.select().from(workerHeartbeats);
  const byProcess = new Map(rows.map((r) => [r.process, r]));

  return {
    worker: describeHeartbeat(byProcess.get("worker"), now, WORKER_INTERVAL_MS, "worker"),
    poller: describeHeartbeat(byProcess.get("poller"), now, POLLER_INTERVAL_MS, "poller"),
  };
}
