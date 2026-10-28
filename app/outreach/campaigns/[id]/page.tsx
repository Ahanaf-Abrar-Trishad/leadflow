import Link from "next/link";
import { and, asc, eq, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { campaigns, campaignMailboxes, mailboxes, contacts, enrollments, sequenceSteps, messages } from "@/db/schema";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageShell, PageHeader } from "@/components/outreach/PageShell";
import { BlueprintCard } from "@/components/outreach/BlueprintCard";
import { CampaignStartButton } from "./CampaignStartButton";
import { CampaignPauseResumeButton } from "./CampaignPauseResumeButton";
import { ImportContactsForm } from "./ImportContactsForm";
import { StatusPoller } from "./StatusPoller";
import { runPoolPreflight, summarizePoolDomains } from "@/lib/outreach/preflight/pool";
import { CONSOLE_TIMEZONE } from "@/lib/outreach/console/timezone";

// Explicit even though the [id] segment already forces dynamic rendering by
// default (no generateStaticParams here) — see app/outreach/mailboxes/page.tsx.
export const dynamic = "force-dynamic";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LIVE_ENROLLMENT_LIMIT = 8;

const FUNNEL_COLORS: Record<string, string> = {
  Enrolled: "var(--color-ink-faint)",
  Contacted: "var(--color-ink-muted)",
  "In flight": "var(--color-signal)",
  Replied: "var(--color-signal-strong)",
  Bounced: "var(--color-danger)",
  Unsubscribed: "var(--color-flag)",
};

function formatTimestamp(value: Date | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: CONSOLE_TIMEZONE,
  });
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [campaign] = await db.select({ name: campaigns.name }).from(campaigns).where(eq(campaigns.id, id));

  return { title: campaign ? `${campaign.name} | Outreach` : "Campaign | Outreach" };
}

export default async function CampaignStatusPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id));
  if (!campaign) notFound();

  const [steps, statusCounts, pool, liveEnrollments] = await Promise.all([
    db
      .select({
        id: sequenceSteps.id,
        stepOrder: sequenceSteps.stepOrder,
        subjectTemplate: sequenceSteps.subjectTemplate,
        bodyTemplate: sequenceSteps.bodyTemplate,
        delayDays: sequenceSteps.delayDays,
      })
      .from(sequenceSteps)
      .where(eq(sequenceSteps.campaignId, id))
      .orderBy(asc(sequenceSteps.stepOrder)),
    db
      .select({ status: enrollments.status, count: sql<number>`count(*)::int` })
      .from(enrollments)
      .where(eq(enrollments.campaignId, id))
      .groupBy(enrollments.status),
    db
      .select({ fromEmail: mailboxes.fromEmail, provider: mailboxes.provider })
      .from(campaignMailboxes)
      .innerJoin(mailboxes, eq(mailboxes.id, campaignMailboxes.mailboxId))
      .where(eq(campaignMailboxes.campaignId, id)),
    db
      .select({
        enrollmentId: enrollments.id,
        contactEmail: contacts.email,
        currentStep: enrollments.currentStep,
        status: enrollments.status,
        nextSendAt: enrollments.nextSendAt,
      })
      .from(enrollments)
      .innerJoin(contacts, eq(contacts.id, enrollments.contactId))
      .where(and(eq(enrollments.campaignId, id), eq(enrollments.status, "active")))
      .orderBy(asc(enrollments.nextSendAt))
      .limit(LIVE_ENROLLMENT_LIMIT),
  ]);

  const byStatus = (status: string) => statusCounts.find((s) => s.status === status)?.count ?? 0;
  const total = statusCounts.reduce((sum, row) => sum + row.count, 0);
  const pending = byStatus("pending");
  const active = byStatus("active");
  const replied = byStatus("replied");
  const bounced = byStatus("bounced");
  const unsubscribed = byStatus("unsubscribed");

  const funnel = [
    { label: "Enrolled", value: total },
    { label: "Contacted", value: total - pending },
    { label: "In flight", value: active },
    { label: "Replied", value: replied },
    { label: "Bounced", value: bounced },
    { label: "Unsubscribed", value: unsubscribed },
  ];
  const funnelMax = Math.max(total, 1);

  // Per-step sent counts come straight from `messages`; per-step *replied*
  // counts have no direct column (a reply only flips enrollments.status, it
  // isn't linked to a step) - but the send loop always advances
  // `currentStep` to the *next* step immediately after sending, and
  // handleReplies() freezes that once a reply lands, so a replied
  // enrollment's currentStep - 1 is exactly the step whose send it replied
  // to. See worker/tick.ts and worker/poller.ts.
  const [stepSentCounts, repliedByNextStep] = await Promise.all([
    db
      .select({ stepId: messages.stepId, count: sql<number>`count(*)::int` })
      .from(messages)
      .innerJoin(sequenceSteps, eq(sequenceSteps.id, messages.stepId))
      .where(eq(sequenceSteps.campaignId, id))
      .groupBy(messages.stepId),
    db
      .select({ currentStep: enrollments.currentStep, count: sql<number>`count(*)::int` })
      .from(enrollments)
      .where(and(eq(enrollments.campaignId, id), eq(enrollments.status, "replied")))
      .groupBy(enrollments.currentStep),
  ]);

  const sentByStepId = new Map(stepSentCounts.map((r) => [r.stepId, r.count]));
  const repliedByStepOrder = new Map(repliedByNextStep.map((r) => [r.currentStep - 1, r.count]));

  const { senderDomains, trustedDomains } = summarizePoolDomains(pool);
  const preflightRows: { id: string; label: string; pass: boolean; detail: string }[] = [];
  if (pool.length > 0) {
    const enrolledContacts = await db
      .select({ id: contacts.id, email: contacts.email, fields: contacts.fields })
      .from(contacts)
      .innerJoin(enrollments, eq(enrollments.contactId, contacts.id))
      .where(eq(enrollments.campaignId, id));

    const result = await runPoolPreflight({
      senderDomains,
      trustedDomains,
      dkimSelector: "hostingermail1",
      postalAddress: campaign.postalAddress,
      templates: steps.flatMap((step) => [step.subjectTemplate, step.bodyTemplate]),
      contacts: enrolledContacts.map((c) => ({ ...c, fields: { ...c.fields, unsubscribe_token: "placeholder" } })),
    });

    const multiDomain = result.perDomain.length > 1;
    for (const { domain, result: domainResult } of result.perDomain) {
      for (const check of domainResult.checks) {
        preflightRows.push({
          id: `${domain}-${check.id}`,
          label: multiDomain ? `${check.label} (${domain})` : check.label,
          pass: check.pass,
          detail: check.detail,
        });
      }
    }
    const first = result.perDomain[0]?.result;
    preflightRows.push({
      id: "postal",
      label: "Postal address",
      pass: first?.hasPostalAddress ?? false,
      detail: first?.hasPostalAddress ? "Present" : "Missing — required by CAN-SPAM",
    });
    preflightRows.push({
      id: "merge-fields",
      label: "Merge fields",
      pass: (first?.unresolvedContacts.length ?? 1) === 0,
      detail:
        first && first.unresolvedContacts.length > 0
          ? `${first.unresolvedContacts.length} contact(s) missing a referenced field`
          : "All templates resolve for every enrolled contact",
    });
  }

  const sendDays = campaign.businessDays.map((day) => DAYS[day]).join(", ");

  return (
    <PageShell width="wide">
      <StatusPoller active={campaign.status === "active"} />

      <PageHeader
        back={{ href: "/outreach", label: "All campaigns" }}
        eyebrow={<StatusBadge status={campaign.status} />}
        title={campaign.name}
        description={`Sends ${sendDays} · ${campaign.businessHoursStart}:00–${campaign.businessHoursEnd}:00 recipient local · max ${campaign.domainThrottleLimit}/domain per 24h`}
        actions={
          <>
            {campaign.status === "draft" && (
              <Link
                href={`/outreach/campaigns/${campaign.id}/edit`}
                className="inline-flex min-h-11 items-center rounded-md border border-border-strong bg-surface px-4 text-sm font-medium text-ink shadow-raised transition-[background-color,transform] duration-200 ease-out hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:scale-[0.96]"
              >
                Edit
              </Link>
            )}
            {(campaign.status === "active" || campaign.status === "paused") && (
              <CampaignPauseResumeButton campaignId={campaign.id} status={campaign.status} />
            )}
            <Link
              href={`/outreach/campaigns/${campaign.id}/enrollments`}
              className="inline-flex min-h-11 items-center rounded-md border border-border-strong bg-surface px-4 text-sm font-medium text-ink shadow-raised transition-[background-color,transform] duration-200 ease-out hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:scale-[0.96]"
            >
              Contacts
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_336px] lg:items-start">
        {/* funnel + live enrollments */}
        <div className="flex flex-col gap-5">
          <BlueprintCard>
            <div className="mb-4 flex items-baseline gap-3">
              <span className="font-display text-[13px] font-semibold uppercase tracking-[0.12em]">
                Enrollment funnel
              </span>
              <span className="text-xs text-ink-muted">{total} contacts</span>
            </div>
            {total === 0 ? (
              <EmptyState
                title="No contacts imported yet"
                description="Upload a CSV below. Addresses already on the suppression list are skipped automatically."
              />
            ) : (
              <div className="flex flex-col gap-1.5">
                {funnel.map((row) => (
                  <div key={row.label} className="flex items-center gap-3.5">
                    <span className="w-[104px] flex-none text-xs uppercase tracking-[0.08em] text-ink-muted">
                      {row.label}
                    </span>
                    <div className="relative h-5 flex-1 bg-ink/[0.06]">
                      <div
                        className="h-full"
                        style={{ width: `${(row.value / funnelMax) * 100}%`, background: FUNNEL_COLORS[row.label] }}
                      />
                    </div>
                    <span data-numeric className="w-[52px] flex-none text-right font-display text-lg font-semibold">
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </BlueprintCard>

          <BlueprintCard noPadding>
            <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
              <span className="font-display text-[13px] font-semibold uppercase tracking-[0.12em]">
                Live enrollments
              </span>
              <div className="flex-1" />
              <span className="text-xs text-ink-muted">{active} in flight</span>
            </div>
            {liveEnrollments.length === 0 ? (
              <div className="px-4 py-6 text-sm text-ink-muted">
                Nothing in flight. Import a contact CSV, then start the campaign to schedule the first step.
              </div>
            ) : (
              liveEnrollments.map((e) => (
                <div
                  key={e.enrollmentId}
                  className="flex items-center gap-3.5 border-b border-border px-4 py-2.5 text-sm last:border-0"
                >
                  <span className="h-2 w-2 flex-none rotate-45 bg-signal" aria-hidden="true" />
                  <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{e.contactEmail}</span>
                  <span className="flex-none text-xs uppercase tracking-[0.08em] text-ink-muted">
                    Step {e.currentStep}
                  </span>
                  <span className="flex-none text-xs text-ink-faint">{formatTimestamp(e.nextSendAt)}</span>
                </div>
              ))
            )}
          </BlueprintCard>
        </div>

        {/* sequence + preflight sidebar */}
        <div className="flex flex-col gap-5">
          <BlueprintCard>
            <div className="mb-3.5 font-display text-[13px] font-semibold uppercase tracking-[0.12em]">Sequence</div>
            <div className="flex flex-col">
              {steps.map((step, index) => {
                const sent = sentByStepId.get(step.id) ?? 0;
                const stepReplied = repliedByStepOrder.get(step.stepOrder) ?? 0;
                const rate = sent > 0 ? `${((stepReplied / sent) * 100).toFixed(0)}%` : "—";

                return (
                  <div key={step.id} className="flex gap-2.5 pb-3.5">
                    <div className="flex flex-none flex-col items-center">
                      <span
                        data-numeric
                        className="flex h-[22px] w-[22px] items-center justify-center border border-border text-[11.5px] font-bold"
                      >
                        {step.stepOrder}
                      </span>
                      {index < steps.length - 1 && <span className="mt-1 min-h-5 w-px flex-1 bg-border" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium leading-snug">{step.subjectTemplate}</div>
                      <div className="mt-0.5 text-[11px] text-ink-faint">
                        {step.stepOrder === 1 ? "Sent first" : `${step.delayDays}d after step ${step.stepOrder - 1}, if no reply`}
                      </div>
                      <div className="mt-1.5 flex gap-3 text-[11.5px]">
                        <span className="text-ink-muted">
                          sent <b className="font-bold text-ink">{sent}</b>
                        </span>
                        <span className="text-signal-strong">
                          replied <b className="font-bold">{stepReplied}</b>
                        </span>
                        <span className="text-ink-faint">{rate}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </BlueprintCard>

          <BlueprintCard>
            <div className="mb-2.5 font-display text-[13px] font-semibold uppercase tracking-[0.12em]">Preflight</div>
            {pool.length === 0 ? (
              <p className="text-[12.5px] text-ink-muted">No mailboxes assigned to this campaign yet.</p>
            ) : (
              preflightRows.map((row) => (
                <div key={row.id} className="flex items-center gap-2.5 py-1 text-[12.5px]" title={row.detail}>
                  <span className={`h-1.5 w-1.5 flex-none rotate-45 ${row.pass ? "bg-signal" : "bg-danger"}`} />
                  <span className="flex-1">{row.label}</span>
                  <span className={`text-[11px] uppercase tracking-[0.06em] ${row.pass ? "text-signal-strong" : "text-danger"}`}>
                    {row.pass ? "pass" : "fail"}
                  </span>
                </div>
              ))
            )}
          </BlueprintCard>
        </div>
      </div>

      {campaign.status === "draft" && (
        <div className="mt-5">
          <BlueprintCard className="flex flex-col gap-8">
            <section>
              <h2 className="font-display text-lg font-semibold text-ink">Import contacts</h2>
              <div className="mt-4">
                <ImportContactsForm campaignId={campaign.id} />
              </div>
            </section>
            <div className="border-t border-border pt-6">
              <h2 className="font-display text-lg font-semibold text-ink">Start sending</h2>
              <p className="mt-1 text-sm text-ink-muted">
                Runs the preflight checks — authentication records, postal address, merge fields and the
                unsubscribe token — then schedules every pending contact.
              </p>
              <CampaignStartButton campaignId={campaign.id} />
            </div>
          </BlueprintCard>
        </div>
      )}
    </PageShell>
  );
}
