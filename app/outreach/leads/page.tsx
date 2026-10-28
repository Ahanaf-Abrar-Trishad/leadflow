import Link from "next/link";
import { PageShell, PageHeader } from "@/components/outreach/PageShell";
import { Pagination } from "@/components/outreach/Pagination";
import { EmptyState } from "@/components/shared/EmptyState";
import { parsePageParam } from "@/lib/outreach/pagination";
import { leadFiltersQuery, listEnrollableCampaigns, listLeads, parseLeadFilters } from "@/lib/leads/queries";
import { LeadsTable } from "./LeadsTable";

export const metadata = { title: "Leads | LeadFlow" };
export const dynamic = "force-dynamic";

const selectClass =
  "min-h-10 rounded-md border border-border-strong bg-surface px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal";

const actionLinkClass =
  "inline-flex min-h-11 items-center rounded-md px-4 text-sm font-medium transition-[background-color,transform] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:scale-[0.96]";

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const filters = parseLeadFilters(params);
  const page = parsePageParam(params.page);

  const [{ rows, hasNextPage }, campaigns] = await Promise.all([listLeads(filters, page), listEnrollableCampaigns()]);
  const isFiltered = Object.values(filters).some(Boolean);

  return (
    <PageShell width="wide">
      <PageHeader
        title="Leads"
        description="Every business found by a scrape or imported from a file, best-scored first. Add the ones with an email to a campaign."
        actions={
          <>
            <Link href="/outreach/leads/import" className={`${actionLinkClass} border border-border bg-surface text-ink shadow-raised hover:bg-paper`}>
              Import CSV
            </Link>
            <Link href="/outreach/leads/scrape" className={`${actionLinkClass} bg-signal text-white shadow-raised hover:bg-signal-strong`}>
              Scrape Google Maps
            </Link>
          </>
        }
      />

      <form method="get" className="mb-5 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm text-ink-muted">
          Search
          <input
            name="q"
            defaultValue={filters.q}
            placeholder="Name, email, website, category"
            className={`${selectClass} w-[260px]`}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink-muted">
          Source
          <select name="source" defaultValue={filters.source ?? ""} className={selectClass}>
            <option value="">All</option>
            <option value="gmaps">Google Maps</option>
            <option value="scout">Scout</option>
            <option value="csv">CSV</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink-muted">
          Status
          <select name="status" defaultValue={filters.status ?? ""} className={selectClass}>
            <option value="">All</option>
            <option value="new">New</option>
            <option value="in_campaign">In campaign</option>
            <option value="disqualified">Disqualified</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink-muted">
          Email
          <select name="email" defaultValue={filters.email ?? ""} className={selectClass}>
            <option value="">Any</option>
            <option value="with">Has email</option>
            <option value="without">No email</option>
          </select>
        </label>
        {filters.job && <input type="hidden" name="job" value={filters.job} />}
        <button
          type="submit"
          className="min-h-10 rounded-md border border-border-strong bg-surface px-4 text-sm font-medium text-ink hover:bg-paper"
        >
          Apply
        </button>
        {isFiltered && (
          <Link href="/outreach/leads" className="min-h-10 px-2 py-2 text-sm text-ink-muted hover:text-ink">
            Clear filters
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        <EmptyState
          title={isFiltered ? "No leads match" : "No leads yet"}
          description={
            isFiltered
              ? "Try a different filter or search term."
              : "Run a Google Maps scrape, or import a Scout export or any CSV with business names and emails."
          }
        />
      ) : (
        <LeadsTable rows={rows} campaigns={campaigns} />
      )}

      <Pagination
        page={page}
        hasNextPage={hasNextPage}
        hrefFor={(target) => `/outreach/leads${leadFiltersQuery(filters, target)}`}
      />
    </PageShell>
  );
}
