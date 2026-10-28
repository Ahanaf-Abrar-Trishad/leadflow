import Link from "next/link";
import { PageShell, PageHeader } from "@/components/outreach/PageShell";
import { BlueprintCard } from "@/components/outreach/BlueprintCard";
import { Table, Th, Td, Tr } from "@/components/outreach/Table";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { CONSOLE_TIMEZONE } from "@/lib/outreach/console/timezone";
import { proposalTotals, usd } from "@/lib/proposals/content";
import { listProposals } from "@/lib/proposals/proposals";

export const metadata = { title: "Proposals | LeadFlow" };
export const dynamic = "force-dynamic";

function formatDate(value: Date | null): string {
  return value ? value.toLocaleDateString(undefined, { timeZone: CONSOLE_TIMEZONE, dateStyle: "medium" }) : "-";
}

export default async function ProposalsPage() {
  const rows = await listProposals();

  return (
    <PageShell width="wide">
      <PageHeader
        title="Proposals"
        description="Priced proposals and their e-signatures. Start one from a deal on the Pipeline board; Claude can draft the wording, you set every price."
      />
      {rows.length === 0 ? (
        <EmptyState title="No proposals yet" description="Open a deal on the Pipeline board and choose Proposal." />
      ) : (
        <BlueprintCard noPadding className="overflow-x-auto">
          <Table style={{ minWidth: 820 }}>
            <thead>
              <tr>
                <Th>Proposal</Th>
                <Th>Status</Th>
                <Th align="right">One-time</Th>
                <Th align="right">Monthly</Th>
                <Th>Sent</Th>
                <Th align="right">Views</Th>
                <Th>Signed</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const totals = proposalTotals(row.lineItems);
                return (
                  <Tr key={row.id}>
                    <Td>
                      <Link href={`/outreach/proposals/${row.id}`} className="font-medium text-ink hover:underline">
                        {row.title}
                      </Link>
                      <p className="text-xs text-ink-faint">
                        {row.dealTitle} · {row.contactEmail}
                        {row.draftedBy === "claude" ? " · drafted by Claude" : ""}
                      </p>
                    </Td>
                    <Td>
                      <StatusBadge status={row.status} />
                    </Td>
                    <Td align="right" numeric>
                      {totals.oneTime ? usd.format(totals.oneTime) : "-"}
                    </Td>
                    <Td align="right" numeric>
                      {totals.monthly ? usd.format(totals.monthly) : "-"}
                    </Td>
                    <Td className="whitespace-nowrap text-ink-muted">{formatDate(row.sentAt)}</Td>
                    <Td align="right" numeric className="text-ink-muted">
                      {row.viewCount}
                    </Td>
                    <Td className="text-ink-muted">
                      {row.acceptedAt ? `${row.signerName}, ${formatDate(row.acceptedAt)}` : "-"}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </BlueprintCard>
      )}
    </PageShell>
  );
}
