import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { deals } from "@/db/schema";
import { ProposalDocument } from "@/components/proposals/ProposalDocument";
import { getProposal } from "@/lib/proposals/proposals";

export const metadata = { title: "Proposal preview | LeadFlow" };
export const dynamic = "force-dynamic";

/** Exactly what the client will see, without counting as their view. */
export default async function ProposalPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proposal = /^[0-9a-f-]{36}$/i.test(id) ? await getProposal(id) : null;
  if (!proposal) notFound();
  const [deal] = await db.select({ title: deals.title }).from(deals).where(eq(deals.id, proposal.dealId));
  const shown = proposal.signedSnapshot
    ? { ...proposal.signedSnapshot, validUntil: proposal.signedSnapshot.validUntil ? new Date(proposal.signedSnapshot.validUntil) : null }
    : proposal;

  return (
    <main id="main-content" className="px-4 py-10">
      <p className="mx-auto mb-4 max-w-3xl text-sm text-ink-muted">
        Preview{proposal.signedSnapshot ? " of the signed version" : ""}. The client also sees an accept form below.
      </p>
      <ProposalDocument
        title={shown.title}
        summary={shown.summary}
        sections={shown.sections}
        lineItems={shown.lineItems}
        terms={shown.terms}
        validUntil={shown.validUntil}
        preparedFor={deal?.title ?? "the client"}
        preparedBy={process.env.AGENCY_NAME?.trim() || undefined}
      />
    </main>
  );
}
