import Link from "next/link";
import { PageShell, PageHeader } from "@/components/outreach/PageShell";
import { Pagination } from "@/components/outreach/Pagination";
import { EmptyState } from "@/components/shared/EmptyState";
import { parsePageParam } from "@/lib/outreach/pagination";
import { getQueueStatus, listPendingDrafts } from "@/lib/ai/drafts";
import { DraftCard } from "./DraftCard";

export const metadata = { title: "Approvals | LeadFlow" };
export const dynamic = "force-dynamic";

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page: pageParam } = await searchParams;
  const page = parsePageParam(pageParam);
  const [{ rows, hasNextPage }, queue] = await Promise.all([listPendingDrafts(page), getQueueStatus()]);

  return (
    <PageShell>
      <PageHeader
        title="Approvals"
        description="Opening lines Claude wrote for your leads. Nothing here reaches a prospect until you approve it; an approved line becomes that lead's {{icebreaker}}."
      />

      <p className="mb-6 text-sm text-ink-muted">
        {queue.leadsNeedingIcebreaker} lead{queue.leadsNeedingIcebreaker === 1 ? "" : "s"} with an email still need
        an icebreaker.{" "}
        <Link href="/outreach/settings/claude" className="text-signal-strong hover:underline">
          Connect Claude
        </Link>{" "}
        to draft them.
      </p>

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing to review"
          description="When Claude drafts icebreakers through the LeadFlow connector, they appear here for you to approve, edit or reject."
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {rows.map((draft) => (
            <li key={draft.id}>
              <DraftCard draft={draft} />
            </li>
          ))}
        </ul>
      )}

      <Pagination page={page} hasNextPage={hasNextPage} hrefFor={(target) => `/outreach/approvals?page=${target}`} />
    </PageShell>
  );
}
