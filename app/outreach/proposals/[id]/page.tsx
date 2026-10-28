import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { contacts, deals } from "@/db/schema";
import { PageShell, PageHeader } from "@/components/outreach/PageShell";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { getProposal, proposalUrl } from "@/lib/proposals/proposals";
import { pacificDay, problemsBeforeSending } from "@/lib/proposals/content";
import { ProposalEditor } from "./ProposalEditor";

export const metadata = { title: "Proposal | LeadFlow" };
export const dynamic = "force-dynamic";

export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proposal = /^[0-9a-f-]{36}$/i.test(id) ? await getProposal(id) : null;
  if (!proposal) notFound();

  const [deal] = await db
    .select({ title: deals.title, enrollmentId: deals.enrollmentId, contactEmail: contacts.email, fields: contacts.fields })
    .from(deals)
    .innerJoin(contacts, eq(contacts.id, deals.contactId))
    .where(eq(deals.id, proposal.dealId));

  return (
    <PageShell>
      <PageHeader
        back={{ href: "/outreach/proposals", label: "Proposals" }}
        eyebrow={<StatusBadge status={proposal.status} />}
        title={proposal.title || "Untitled proposal"}
        description={`For ${deal?.title ?? "a deal"} (${deal?.contactEmail ?? "no contact"}).${proposal.draftedBy === "claude" ? " Drafted by Claude - check every claim before sending." : ""}`}
      />
      <ProposalEditor
        proposal={{
          id: proposal.id,
          status: proposal.status,
          title: proposal.title,
          summary: proposal.summary,
          sections: proposal.sections,
          lineItems: proposal.lineItems,
          terms: proposal.terms,
          validUntil: proposal.validUntil ? pacificDay(proposal.validUntil) : "",
          viewCount: proposal.viewCount,
          lastViewedAt: proposal.lastViewedAt?.toISOString() ?? null,
          signerName: proposal.signerName,
          signerEmail: proposal.signerEmail,
          signerIp: proposal.signerIp,
          acceptedAt: proposal.acceptedAt?.toISOString() ?? null,
          declineReason: proposal.declineReason,
        }}
        url={proposal.status === "sent" || proposal.status === "accepted" ? proposalUrl(proposal) : null}
        problems={proposal.status === "draft" ? problemsBeforeSending(proposal) : []}
        canEmail={Boolean(deal?.enrollmentId)}
        defaultMessage={`Hi ${deal?.fields.first_name || deal?.fields.greeting || "there"},\n\nThanks for the conversation. Here is the proposal we discussed - you can review it and accept it online here:`}
      />
    </PageShell>
  );
}
