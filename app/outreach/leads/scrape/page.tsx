import Link from "next/link";
import { PageShell, PageHeader } from "@/components/outreach/PageShell";
import { BlueprintCard } from "@/components/outreach/BlueprintCard";
import { StatusPoller } from "@/components/outreach/StatusPoller";
import { Table, Th, Td, Tr } from "@/components/outreach/Table";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { CONSOLE_TIMEZONE } from "@/lib/outreach/console/timezone";
import { listRecentScrapeJobs } from "@/lib/leads/queries";
import { ScrapeForm } from "./ScrapeForm";

export const metadata = { title: "Scrape Google Maps | LeadFlow" };
export const dynamic = "force-dynamic";

export default async function ScrapePage() {
  const jobs = await listRecentScrapeJobs();
  const isRunning = jobs.some((job) => job.status === "running");

  return (
    <PageShell width="wide">
      <StatusPoller active={isRunning} />
      <PageHeader
        title="Scrape Google Maps"
        description="Find local businesses by type and city. Results land in Leads, merged with any you already have."
        back={{ href: "/outreach/leads", label: "Leads" }}
      />

      <BlueprintCard className="mb-8">
        <ScrapeForm disabled={isRunning} />
        <p className="mt-4 text-xs text-ink-faint">
          One scrape runs at a time. Heavy use (high depth, many runs in a row) can get this server&apos;s IP
          temporarily rate-limited by Google. Scraping Google Maps is against Google&apos;s terms, so keep volumes
          modest and treat results as leads to verify.
        </p>
      </BlueprintCard>

      <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-ink-muted">Recent scrapes</h2>
      {jobs.length === 0 ? (
        <EmptyState title="No scrapes yet" description="Start one above. It usually takes a few minutes." />
      ) : (
        <BlueprintCard noPadding className="overflow-x-auto">
          <Table style={{ minWidth: 760 }}>
            <thead>
              <tr>
                <Th>Search</Th>
                <Th>Status</Th>
                <Th align="right">Found</Th>
                <Th align="right">New</Th>
                <Th>Started</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <Tr key={job.id}>
                  <Td>
                    <p className="font-medium text-ink">{job.keyword}</p>
                    <p className="text-xs text-ink-faint">
                      depth {job.depth}
                      {job.collectEmails ? " · with emails" : ""}
                    </p>
                    {job.error && <p className="mt-1 max-w-[420px] text-xs text-danger">{job.error}</p>}
                  </Td>
                  <Td>
                    <StatusBadge status={job.status} />
                  </Td>
                  <Td align="right" numeric className="text-ink-muted">
                    {job.status === "done" ? job.leadsFound : "—"}
                  </Td>
                  <Td align="right" numeric className="font-semibold text-ink">
                    {job.status === "done" ? job.leadsAdded : "—"}
                  </Td>
                  <Td className="whitespace-nowrap text-ink-muted">
                    <time dateTime={job.createdAt.toISOString()}>
                      {job.createdAt.toLocaleString(undefined, {
                        timeZone: CONSOLE_TIMEZONE,
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </time>
                  </Td>
                  <Td align="right">
                    {job.status === "done" && (
                      <Link href={`/outreach/leads?job=${job.id}`} className="text-sm text-signal-strong hover:underline">
                        View leads
                      </Link>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </BlueprintCard>
      )}
    </PageShell>
  );
}
