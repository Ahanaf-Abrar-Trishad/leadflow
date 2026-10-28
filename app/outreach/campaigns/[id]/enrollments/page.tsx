import { asc, desc, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { campaigns, contacts, enrollments, mailboxes, messages } from "@/db/schema";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageShell, PageHeader } from "@/components/outreach/PageShell";
import { Pagination } from "@/components/outreach/Pagination";
import { PAGE_SIZE, parsePageParam, pageOffset } from "@/lib/outreach/pagination";
import { CONSOLE_TIMEZONE } from "@/lib/outreach/console/timezone";
import { SendNowButton } from "./SendNowButton";

export const dynamic = "force-dynamic";

const TH = "px-4 py-2.5 font-mono text-[0.625rem] font-medium uppercase tracking-wider text-ink-faint";
const TD = "px-4 py-3 align-top";

function formatTimestamp(value: Date, timeZone: string = CONSOLE_TIMEZONE): string {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [campaign] = await db.select({ name: campaigns.name }).from(campaigns).where(eq(campaigns.id, id));

  return { title: campaign ? `${campaign.name} contacts | Outreach` : "Contacts | Outreach" };
}

export default async function CampaignEnrollmentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const { page: pageParam } = await searchParams;
  const page = parsePageParam(pageParam);

  const [campaign] = await db.select({ name: campaigns.name }).from(campaigns).where(eq(campaigns.id, id));
  if (!campaign) notFound();

  const rows = await db
    .select({
      enrollmentId: enrollments.id,
      status: enrollments.status,
      currentStep: enrollments.currentStep,
      nextSendAt: enrollments.nextSendAt,
      contactEmail: contacts.email,
      contactTimezone: contacts.timezone,
      mailboxFromEmail: mailboxes.fromEmail,
    })
    .from(enrollments)
    .innerJoin(contacts, eq(contacts.id, enrollments.contactId))
    .leftJoin(mailboxes, eq(mailboxes.id, enrollments.mailboxId))
    .where(eq(enrollments.campaignId, id))
    .orderBy(asc(contacts.email))
    .limit(PAGE_SIZE + 1)
    .offset(pageOffset(page));

  const hasNextPage = rows.length > PAGE_SIZE;
  const pageRows = rows.slice(0, PAGE_SIZE);

  // Scoped to the 50 enrollments actually on this page. The previous version
  // selected every message in the table and filtered in JS, which grows with
  // total send volume rather than with what's on screen.
  const messagesByEnrollment = new Map<string, { rfcMessageId: string; status: string; sentAt: Date }[]>();
  if (pageRows.length > 0) {
    const messageRows = await db
      .select({
        enrollmentId: messages.enrollmentId,
        rfcMessageId: messages.rfcMessageId,
        status: messages.status,
        sentAt: messages.sentAt,
      })
      .from(messages)
      .where(inArray(messages.enrollmentId, pageRows.map((row) => row.enrollmentId)))
      .orderBy(desc(messages.sentAt));

    for (const row of messageRows) {
      const existing = messagesByEnrollment.get(row.enrollmentId) ?? [];
      existing.push(row);
      messagesByEnrollment.set(row.enrollmentId, existing);
    }
  }

  return (
    <PageShell width="wide">
      <PageHeader
        back={{ href: `/outreach/campaigns/${id}`, label: campaign.name }}
        title="Contacts"
        description="Message metadata only — the rendered subject and body aren't stored per send."
      />

      {pageRows.length === 0 ? (
        <EmptyState
          title="No contacts on this page"
          description="Import a CSV from the campaign page to enrol contacts into this sequence."
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-raised">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border">
              <tr>
                <th className={TH}>Contact</th>
                <th className={TH}>Status</th>
                <th className={TH}>Step</th>
                <th className={TH}>Mailbox</th>
                <th className={TH}>Next send</th>
                <th className={TH}>Sent</th>
                <th className={TH}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => {
                const sent = messagesByEnrollment.get(row.enrollmentId) ?? [];

                return (
                  <tr key={row.enrollmentId} className="border-b border-border last:border-0">
                    <td className={`${TD} text-ink`}>{row.contactEmail}</td>
                    <td className={TD}>
                      <StatusBadge status={row.status} />
                    </td>
                    <td data-numeric className={`${TD} font-mono text-xs text-ink-muted`}>
                      {row.currentStep}
                    </td>
                    <td className={`${TD} text-xs text-ink-faint`}>{row.mailboxFromEmail ?? "—"}</td>
                    <td data-numeric className={`${TD} font-mono text-xs`}>
                      {row.nextSendAt ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-ink-muted">{formatTimestamp(row.nextSendAt)}</span>
                          <span className="text-ink-faint">
                            recipient: {formatTimestamp(row.nextSendAt, row.contactTimezone)} ({row.contactTimezone})
                          </span>
                        </div>
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                    </td>
                    <td className={TD}>
                      {sent.length === 0 ? (
                        <span className="text-xs text-ink-faint">none yet</span>
                      ) : (
                        <ul className="flex flex-col gap-0.5">
                          {sent.map((message) => (
                            <li
                              key={message.rfcMessageId}
                              data-numeric
                              className="font-mono text-xs text-ink-faint"
                            >
                              {formatTimestamp(message.sentAt)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className={TD}>
                      {row.status === "active" && <SendNowButton enrollmentId={row.enrollmentId} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        page={page}
        hasNextPage={hasNextPage}
        hrefFor={(target) => `/outreach/campaigns/${id}/enrollments?page=${target}`}
      />
    </PageShell>
  );
}
