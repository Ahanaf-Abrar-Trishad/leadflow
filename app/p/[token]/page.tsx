import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { deals } from "@/db/schema";
import { ProposalDocument } from "@/components/proposals/ProposalDocument";
import { getProposalByToken, recordProposalView } from "@/lib/proposals/proposals";
import { firstOpenInvoice, payUrl } from "@/lib/billing/invoices";
import { formatCents } from "@/lib/billing/money";
import { AcceptPanel } from "./AcceptPanel";

/*
 * The client-facing proposal. Public on purpose (outside proxy.ts's gate):
 * the signed, versioned token is the only key, and a draft, withdrawn or
 * revoked proposal resolves to the same "no longer valid" page as a forged
 * link, so a guess learns nothing.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Proposal", robots: { index: false, follow: false } };

export default async function PublicProposalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const proposal = await getProposalByToken(token);

  if (!proposal) {
    return (
      <main id="main-content" className="mx-auto w-full max-w-lg px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-bold text-ink">This link is no longer valid</h1>
        <p className="mt-3 text-sm text-ink-muted">
          The proposal may have been updated or withdrawn. Reply to our last email and we will send you the current one.
        </p>
      </main>
    );
  }

  await recordProposalView(proposal.id);
  const [deal] = await db.select({ title: deals.title }).from(deals).where(eq(deals.id, proposal.dealId));
  const expired = proposal.status === "sent" && proposal.validUntil !== null && proposal.validUntil <= new Date();
  // Right after signing, send the client straight on to what is due.
  const due = proposal.status === "accepted" ? await firstOpenInvoice(proposal.dealId) : null;

  return (
    <main id="main-content" className="w-full px-4 py-10 sm:py-16">
      <ProposalDocument
        title={proposal.title}
        summary={proposal.summary}
        sections={proposal.sections}
        lineItems={proposal.lineItems}
        terms={proposal.terms}
        validUntil={proposal.validUntil}
        depositPercent={proposal.depositPercent}
        preparedFor={deal?.title ?? "you"}
        preparedBy={process.env.AGENCY_NAME?.trim() || undefined}
      />
      <div className="mx-auto mt-6 max-w-3xl print:hidden">
        <AcceptPanel
          token={token}
          status={expired ? "expired" : proposal.status}
          signerName={proposal.signerName}
          acceptedAt={proposal.acceptedAt?.toISOString() ?? null}
          payment={due ? { url: payUrl(due), label: `Pay ${formatCents(due.amountCents)}${due.kind === "monthly" ? " / month" : ""} now` } : null}
        />
      </div>
    </main>
  );
}
