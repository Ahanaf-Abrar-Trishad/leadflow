import Link from "next/link";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageShell, PageHeader } from "@/components/outreach/PageShell";
import { BlueprintCard } from "@/components/outreach/BlueprintCard";
import { Table, Th, Td, Tr } from "@/components/outreach/Table";
import { Sparkline } from "@/components/outreach/Sparkline";
import {
  getMailboxHealthRows,
  getCampaignPerformanceRows,
  getSentVolumeTrend,
  getWorkerHeartbeats,
  type MailboxHealthRow,
  type CampaignPerformanceRow,
  type HeartbeatStatus,
} from "@/lib/outreach/dashboard/queries";
import { campaignNeedsAttention, campaignBounceRatio } from "@/lib/outreach/campaigns/attention";
import { getRecentReplies } from "@/lib/outreach/replies/queries";
import { CONSOLE_TIMEZONE } from "@/lib/outreach/console/timezone";

export const metadata = { title: "Dashboard | LeadFlow" };

// See app/outreach/mailboxes/page.tsx for why this is required.
export const dynamic = "force-dynamic";

/** Gmail starts filtering a sender well before this, so it's a warning, not a limit. */
const BOUNCE_WARN_RATE = 0.02;

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

/** Horizontal fill for today's volume against the mailbox's cap. */
function CapacityMeter({ sent, cap }: { sent: number; cap: number }) {
  const ratio = cap > 0 ? Math.min(sent / cap, 1) : 0;

  return (
    <div className="flex items-center gap-2.5">
      <span className="h-1.5 w-16 flex-none overflow-hidden bg-paper">
        <span
          className={`block h-full ${ratio >= 1 ? "bg-flag" : "bg-signal"}`}
          style={{ width: `${ratio * 100}%` }}
        />
      </span>
      <span data-numeric className="font-mono text-xs text-ink-muted">
        {sent}/{cap}
      </span>
    </div>
  );
}

function Instrument({
  label,
  value,
  unit,
  trend,
  note,
  tone = "text-ink",
}: {
  label: string;
  value: string;
  unit?: string;
  trend: number[];
  note: string;
  tone?: string;
}) {
  return (
    <BlueprintCard>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">{label}</span>
      </div>
      <div className="mt-1.5 flex items-end gap-2">
        <span data-numeric className={`font-display text-[34px] font-semibold leading-none tracking-[-0.02em] ${tone}`}>
          {value}
        </span>
        {unit && <span className="pb-1 text-xs text-ink-muted">{unit}</span>}
      </div>
      <Sparkline values={trend} className="mt-2.5 text-signal" />
      <div className="mt-1.5 text-[11px] text-ink-faint">{note}</div>
    </BlueprintCard>
  );
}

interface AttentionItem {
  id: string;
  title: string;
  detail: string;
  /** Omitted for items with no in-app page to send the operator to - e.g. a
   * stopped background process, which needs restarting on the host, not a
   * click here. */
  href?: string;
  actionLabel?: string;
}

function buildAttention(
  mailboxRows: MailboxHealthRow[],
  campaignRows: CampaignPerformanceRow[],
  heartbeats: HeartbeatStatus[],
): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const heartbeat of heartbeats) {
    if (heartbeat.healthy) continue;
    items.push({
      id: `process-${heartbeat.process}`,
      title: `${heartbeat.process} not running`,
      detail:
        heartbeat.secondsAgo === null
          ? "Has never checked in - nothing sends or gets polled until it starts."
          : `Last checked in ${formatAge(heartbeat.secondsAgo)}.`,
    });
  }

  for (const mailbox of mailboxRows) {
    if (mailbox.health === "healthy") continue;
    items.push({
      id: `mailbox-${mailbox.id}`,
      title: mailbox.fromEmail,
      detail: mailbox.health === "paused" ? "Paused — needs reconnecting" : "Warming up",
      href: "/outreach/mailboxes",
      actionLabel: "Inspect",
    });
  }

  for (const campaign of campaignRows) {
    if (!campaignNeedsAttention(campaign)) continue;
    const ratio = campaignBounceRatio(campaign);
    items.push({
      id: `campaign-bounce-${campaign.id}`,
      title: campaign.name,
      detail: `Bounce rate ${formatPercent(ratio)} across ${campaign.enrolled} enrolled`,
      href: `/outreach/campaigns/${campaign.id}`,
      actionLabel: "Review",
    });
  }

  return items;
}

function startOfToday(): Date {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start;
}

function formatAge(secondsAgo: number | null): string {
  if (secondsAgo === null) return "never run";
  if (secondsAgo < 60) return `${secondsAgo}s ago`;
  return `${Math.round(secondsAgo / 60)}m ago`;
}

export default async function DashboardPage() {
  const [mailboxRows, campaignRows, sentTrend, recentReplies, heartbeats] = await Promise.all([
    getMailboxHealthRows(),
    getCampaignPerformanceRows(),
    getSentVolumeTrend(),
    getRecentReplies(startOfToday()),
    getWorkerHeartbeats(),
  ]);

  const attention = buildAttention(mailboxRows, campaignRows, [heartbeats.worker, heartbeats.poller]);

  const activeCampaigns = campaignRows.filter((c) => c.status === "active").length;
  const sentToday = mailboxRows.reduce((sum, m) => sum + m.sentToday, 0);

  const repliedTotal = campaignRows.reduce((sum, c) => sum + c.replied, 0);
  const bouncedTotal = campaignRows.reduce((sum, c) => sum + c.bounced, 0);
  const completedTotal = campaignRows.reduce((sum, c) => sum + c.completed, 0);
  const replyDenominator = repliedTotal + bouncedTotal + completedTotal;
  const overallReplyRate = replyDenominator > 0 ? repliedTotal / replyDenominator : null;

  const bounceSamples = mailboxRows.filter((m) => m.bounceRate);
  const overallBounceRate =
    bounceSamples.length > 0
      ? bounceSamples.reduce((sum, m) => sum + (m.bounceRate?.rate ?? 0), 0) / bounceSamples.length
      : null;

  return (
    <PageShell width="wide">
      <PageHeader
        title="Deliverability"
        description="Sending health across every mailbox and campaign. If the worker isn't running, nothing below moves."
      />

      <section className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[heartbeats.worker, heartbeats.poller].map((heartbeat) => (
          <div
            key={heartbeat.process}
            className="flex items-center gap-2.5 border border-border bg-surface px-4 py-3"
          >
            <span
              className={`h-1.5 w-1.5 flex-none rounded-full ${heartbeat.healthy ? "bg-signal" : "bg-danger"}`}
            />
            <span className="text-[13px] font-medium capitalize">{heartbeat.process}</span>
            <span className="ml-auto font-mono text-[11px] text-ink-faint">{formatAge(heartbeat.secondsAgo)}</span>
          </div>
        ))}
      </section>

      <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Instrument
          label="Active campaigns"
          value={String(activeCampaigns)}
          trend={[activeCampaigns, activeCampaigns]}
          note={`${campaignRows.length} total`}
        />
        <Instrument
          label="Sent today"
          value={String(sentToday)}
          trend={sentTrend}
          note="trailing 14 days"
        />
        <Instrument
          label="Reply rate"
          value={formatPercent(overallReplyRate)}
          trend={[overallReplyRate ?? 0, overallReplyRate ?? 0]}
          note={`${repliedTotal} replied`}
          tone={overallReplyRate ? "text-signal-strong" : "text-ink"}
        />
        <Instrument
          label="Bounce rate"
          value={formatPercent(overallBounceRate)}
          trend={[overallBounceRate ?? 0, overallBounceRate ?? 0]}
          note={overallBounceRate !== null && overallBounceRate >= BOUNCE_WARN_RATE ? "above warning threshold" : "within range"}
          tone={overallBounceRate !== null && overallBounceRate >= BOUNCE_WARN_RATE ? "text-danger" : "text-ink"}
        />
      </section>

      <section className="mb-8 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-start">
        <BlueprintCard noPadding>
          <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
            <span className="font-display text-[13px] font-semibold uppercase tracking-[0.12em]">
              Needs attention
            </span>
            {attention.length > 0 && (
              <span className="bg-danger px-1.5 py-px text-[11px] tracking-wide text-white">{attention.length}</span>
            )}
          </div>
          {attention.length === 0 ? (
            <div className="px-4 py-6 text-sm text-ink-muted">Nothing needs attention right now.</div>
          ) : (
            attention.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3.5 border-b border-border px-4 py-2.5 last:border-0 hover:bg-ink/[0.03]"
              >
                <span className="h-2 w-2 flex-none rotate-45 bg-danger" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{item.title}</div>
                  <div className="mt-px text-xs text-ink-muted">{item.detail}</div>
                </div>
                {item.href && item.actionLabel && (
                  <Link
                    href={item.href}
                    className="border border-border px-2.5 py-1 text-xs text-ink transition-colors duration-200 ease-out hover:bg-paper"
                  >
                    {item.actionLabel}
                  </Link>
                )}
              </div>
            ))
          )}
        </BlueprintCard>

        <BlueprintCard noPadding>
          <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
            <span className="font-display text-[13px] font-semibold uppercase tracking-[0.12em]">
              Replies today
            </span>
            <div className="flex-1" />
            <Link href="/outreach/replies" className="text-xs">
              Open inbox →
            </Link>
          </div>
          {recentReplies.length === 0 ? (
            <div className="px-4 py-6 text-sm text-ink-muted">No replies yet today.</div>
          ) : (
            recentReplies.map((reply) => (
              <Link
                key={reply.id}
                href={`/outreach/replies?thread=${reply.enrollmentId}`}
                className="flex items-baseline gap-3 border-b border-border px-4 py-2.5 text-sm last:border-0 hover:bg-ink/[0.03]"
              >
                <span className="w-[42px] flex-none text-[11px] text-ink-faint">
                  {new Date(reply.createdAt).toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: CONSOLE_TIMEZONE,
                  })}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-medium">{reply.contactEmail}</div>
                  <div className="truncate text-[11.5px] text-ink-faint">{reply.campaignName}</div>
                </div>
              </Link>
            ))
          )}
        </BlueprintCard>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-ink-muted">
          Capacity today
        </h2>
        {mailboxRows.length === 0 ? (
          <EmptyState
            title="No mailboxes connected"
            description="A campaign can't send until at least one healthy mailbox is attached to it."
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {mailboxRows.map((row) => (
              <div key={row.id} className="border border-border bg-surface px-4 py-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-1.5 w-1.5 flex-none rounded-full ${row.health === "healthy" ? "bg-signal" : "bg-flag"}`}
                  />
                  <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-medium">
                    {row.fromEmail}
                  </span>
                </div>
                <div className="mt-2">
                  <CapacityMeter sent={row.sentToday} cap={row.dailyCap} />
                </div>
                <div className="mt-1.5 text-[11px] text-ink-faint">
                  {row.bounceRate ? `${formatPercent(row.bounceRate.rate)} bounce` : "not enough data"}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-ink-muted">
          Campaign performance
        </h2>
        {campaignRows.length === 0 ? (
          <EmptyState title="No campaigns yet" description="Create a campaign to see performance here." />
        ) : (
          <BlueprintCard noPadding className="overflow-x-auto">
            <Table style={{ minWidth: 900 }}>
              <thead>
                <tr>
                  <Th>Campaign</Th>
                  <Th>Status</Th>
                  <Th align="right">Enrolled</Th>
                  <Th align="right">In flight</Th>
                  <Th align="right">Replied</Th>
                  <Th align="right">Bounced</Th>
                  <Th align="right">Completed</Th>
                  <Th align="right">Reply rate</Th>
                </tr>
              </thead>
              <tbody>
                {campaignRows.map((row) => (
                  <Tr key={row.id}>
                    <Td>
                      <Link
                        href={`/outreach/campaigns/${row.id}`}
                        className="font-medium text-ink underline decoration-border-strong underline-offset-4 transition-colors duration-200 ease-out hover:decoration-signal"
                      >
                        {row.name}
                      </Link>
                    </Td>
                    <Td>
                      <StatusBadge status={row.status} />
                    </Td>
                    <Td align="right" numeric className="text-ink-muted">{row.enrolled}</Td>
                    <Td align="right" numeric className="text-ink-muted">{row.active}</Td>
                    <Td align="right" numeric className="font-semibold text-signal-strong">{row.replied}</Td>
                    <Td align="right" numeric className={row.bounced > 0 ? "text-danger" : "text-ink-muted"}>
                      {row.bounced}
                    </Td>
                    <Td align="right" numeric className="text-ink-muted">{row.completed}</Td>
                    <Td align="right" numeric className="font-medium text-ink">{formatPercent(row.replyRate)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </BlueprintCard>
        )}
      </section>
    </PageShell>
  );
}
