import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { suppressions } from "@/db/schema";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge, type StatusTone } from "@/components/shared/StatusBadge";
import { PageShell, PageHeader } from "@/components/outreach/PageShell";
import { BlueprintCard } from "@/components/outreach/BlueprintCard";
import { Pagination } from "@/components/outreach/Pagination";
import { PAGE_SIZE, parsePageParam, pageOffset } from "@/lib/outreach/pagination";
import { CONSOLE_TIMEZONE } from "@/lib/outreach/console/timezone";
import { SuppressionForm } from "./SuppressionForm";
import { RemoveSuppressionButton } from "./RemoveSuppressionButton";

export const metadata = { title: "Suppressions | LeadFlow" };
export const dynamic = "force-dynamic";

/* hard_bounce is written by the poller; anything else was added by hand. */
const reasonTone = (reason: string): StatusTone => (reason === "hard_bounce" ? "fault" : "neutral");

export default async function SuppressionsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page: pageParam } = await searchParams;
  const page = parsePageParam(pageParam);

  const rows = await db
    .select()
    .from(suppressions)
    .orderBy(desc(suppressions.createdAt))
    .limit(PAGE_SIZE + 1)
    .offset(pageOffset(page));

  const hasNextPage = rows.length > PAGE_SIZE;
  const pageRows = rows.slice(0, PAGE_SIZE);

  return (
    <PageShell>
      <PageHeader
        title="Suppressions"
        description="Addresses on this list are never sent to, by any campaign, regardless of what a CSV import contains."
      />

      <BlueprintCard className="mb-8">
        <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-wide text-ink-muted">
          Add an address
        </h2>
        <SuppressionForm />
      </BlueprintCard>

      {pageRows.length === 0 ? (
        <EmptyState
          title="Nothing suppressed"
          description="Hard bounces and unsubscribes land here automatically. You can also add an address by hand above."
        />
      ) : (
        <ul className="animate-stagger flex flex-col gap-2">
          {pageRows.map((row, index) => (
            <li
              key={row.id}
              style={{ "--index": index } as React.CSSProperties}
              className="blueprint flex flex-wrap items-center justify-between gap-4 p-4"
            >
              <i className="corner tl" aria-hidden="true" />
              <i className="corner tr" aria-hidden="true" />
              <i className="corner bl" aria-hidden="true" />
              <i className="corner br" aria-hidden="true" />
              <div className="min-w-0">
                <p className="truncate font-medium text-ink">{row.email}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <StatusBadge status={row.reason} tone={reasonTone(row.reason)} />
                  <time
                    data-numeric
                    dateTime={new Date(row.createdAt).toISOString()}
                    className="font-mono text-xs text-ink-faint"
                  >
                    {new Date(row.createdAt).toLocaleDateString(undefined, { timeZone: CONSOLE_TIMEZONE })}
                  </time>
                </div>
              </div>
              <RemoveSuppressionButton id={row.id} email={row.email} />
            </li>
          ))}
        </ul>
      )}

      <Pagination
        page={page}
        hasNextPage={hasNextPage}
        hrefFor={(target) => `/outreach/suppressions?page=${target}`}
      />
    </PageShell>
  );
}
