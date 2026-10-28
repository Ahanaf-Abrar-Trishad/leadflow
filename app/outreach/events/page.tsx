import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { events } from "@/db/schema";
import { StatusBadge, type StatusTone } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageShell, PageHeader } from "@/components/outreach/PageShell";
import { Pagination } from "@/components/outreach/Pagination";
import { PAGE_SIZE, parsePageParam, pageOffset } from "@/lib/outreach/pagination";
import { CONSOLE_TIMEZONE } from "@/lib/outreach/console/timezone";

export const metadata = { title: "Events | LeadFlow" };
export const dynamic = "force-dynamic";

/* Event names are verbs about outcomes, so they don't map onto the status
 * vocabulary StatusBadge knows - each one names its own tone instead. */
const EVENT_TONES: Record<string, StatusTone> = {
  message_sent: "live",
  send_failed: "fault",
  mailbox_paused: "attention",
};

/** Ids are long, opaque and never the thing being read - only their tail helps. */
function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") return key.toLowerCase().includes("rate") ? `${(value * 100).toFixed(1)}%` : String(value);
  if (typeof value !== "string") return JSON.stringify(value);
  if (/id$/i.test(key) && value.length > 12) return `…${value.slice(-8)}`;
  return value;
}

function formatKey(key: string): string {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; type?: string }>;
}) {
  const { page: pageParam, type } = await searchParams;
  const page = parsePageParam(pageParam);

  const distinctTypes = await db.selectDistinct({ type: events.type }).from(events);

  // `.where()` must come right after `.from()` in the chain (matching
  // every other query in this codebase) rather than after `.orderBy()`/
  // `.limit()`/`.offset()` - built as two full query branches instead of
  // conditionally patching one in progress.
  const rows = type
    ? await db
        .select()
        .from(events)
        .where(eq(events.type, type))
        .orderBy(desc(events.createdAt))
        .limit(PAGE_SIZE + 1)
        .offset(pageOffset(page))
    : await db.select().from(events).orderBy(desc(events.createdAt)).limit(PAGE_SIZE + 1).offset(pageOffset(page));

  const hasNextPage = rows.length > PAGE_SIZE;
  const pageRows = rows.slice(0, PAGE_SIZE);
  const linkSuffix = type ? `&type=${encodeURIComponent(type)}` : "";

  return (
    <PageShell>
      <PageHeader
        title="Events"
        description="Append-only record of what the worker and poller did. The first place to look when a campaign isn't behaving."
      />

      <form className="mb-6 flex flex-wrap items-end gap-2" action="/outreach/events">
        <label htmlFor="event-type" className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Type</span>
          <select
            id="event-type"
            name="type"
            defaultValue={type ?? ""}
            className="min-h-11 rounded-md border border-border-strong bg-surface px-3 text-sm text-ink transition-colors duration-200 ease-out hover:border-ink-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
          >
            <option value="">All events</option>
            {distinctTypes.map((row) => (
              <option key={row.type} value={row.type}>
                {row.type.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="inline-flex min-h-11 items-center rounded-md border border-border-strong bg-surface px-4 text-sm font-medium text-ink shadow-raised transition-[background-color,transform] duration-200 ease-out hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:scale-[0.96]"
        >
          Filter
        </button>
      </form>

      {pageRows.length === 0 ? (
        <EmptyState
          title={type ? `No ${type.replace(/_/g, " ")} events` : "No events recorded"}
          description={
            type
              ? "Nothing of this type has happened yet. Clear the filter to see everything."
              : "The worker writes here every time it sends, fails, or pauses a mailbox."
          }
        />
      ) : (
        <ul className="animate-stagger flex flex-col gap-2">
          {pageRows.map((row, index) => (
            <li
              key={row.id}
              style={{ "--index": index } as React.CSSProperties}
              className="blueprint p-4"
            >
              <i className="corner tl" aria-hidden="true" />
              <i className="corner tr" aria-hidden="true" />
              <i className="corner bl" aria-hidden="true" />
              <i className="corner br" aria-hidden="true" />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <StatusBadge status={row.type} tone={EVENT_TONES[row.type] ?? "neutral"} />
                <time
                  data-numeric
                  dateTime={new Date(row.createdAt).toISOString()}
                  className="font-mono text-xs text-ink-faint"
                >
                  {new Date(row.createdAt).toLocaleString(undefined, { timeZone: CONSOLE_TIMEZONE })}
                </time>
              </div>

              {/* Rendered as labelled fields rather than a JSON dump - the
                  payloads are flat objects of three or four keys, so the
                  braces were pure noise around the two values worth reading. */}
              <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
                {Object.entries(row.payload as Record<string, unknown>).map(([key, value]) => (
                  <div key={key} className="min-w-0">
                    <dt className="font-mono text-[0.625rem] uppercase tracking-wider text-ink-faint">
                      {formatKey(key)}
                    </dt>
                    <dd
                      data-numeric
                      className="mt-0.5 break-words font-mono text-xs text-ink-muted"
                      title={typeof value === "string" ? value : undefined}
                    >
                      {formatValue(key, value)}
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      )}

      <Pagination
        page={page}
        hasNextPage={hasNextPage}
        hrefFor={(target) => `/outreach/events?page=${target}${linkSuffix}`}
      />
    </PageShell>
  );
}
