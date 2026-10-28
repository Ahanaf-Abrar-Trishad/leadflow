import type { ProposalSnapshot } from "@/db/schema";
import { depositUsd, proposalTotals } from "@/lib/proposals/content";

export interface PlannedInvoice {
  kind: "deposit" | "full" | "monthly";
  description: string;
  amountCents: number;
}

/**
 * The invoices a signed proposal creates, from the exact signed snapshot:
 * the deposit (or the full one-time amount at 100%, nothing at 0%), and the
 * monthly fee when there is one. The balance waits until the operator bills
 * it when the work is done.
 */
export function invoicesForSignedProposal(snapshot: ProposalSnapshot): PlannedInvoice[] {
  const totals = proposalTotals(snapshot.lineItems);
  const percent = snapshot.depositPercent ?? 50;
  const planned: PlannedInvoice[] = [];
  if (totals.oneTime > 0 && percent > 0) {
    planned.push(
      percent >= 100
        ? { kind: "full", description: `${snapshot.title} - payment in full`, amountCents: totals.oneTime * 100 }
        : {
            kind: "deposit",
            description: `${snapshot.title} - ${percent}% deposit`,
            amountCents: depositUsd(totals.oneTime, percent) * 100,
          },
    );
  }
  if (totals.monthly > 0) {
    planned.push({ kind: "monthly", description: `${snapshot.title} - monthly`, amountCents: totals.monthly * 100 });
  }
  return planned;
}

/** What is left of the one-time total after the deposit, in whole dollars. */
export function balanceUsd(snapshot: ProposalSnapshot): number {
  const totals = proposalTotals(snapshot.lineItems);
  const percent = snapshot.depositPercent ?? 50;
  return totals.oneTime - (percent > 0 ? depositUsd(totals.oneTime, percent) : 0);
}
