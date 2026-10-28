import type { ProposalLineItem, ProposalSection } from "@/db/schema";
import { depositUsd, proposalTotals, usd } from "@/lib/proposals/content";

export interface ProposalDocumentProps {
  title: string;
  summary: string;
  sections: ProposalSection[];
  lineItems: ProposalLineItem[];
  terms: string;
  validUntil: Date | null;
  depositPercent: number;
  preparedFor: string;
  preparedBy?: string;
}

/** The proposal as the client reads it - shared by the public page and the
 * operator's preview so both always show the same thing. Plain text only:
 * every field is rendered as text, never as HTML. */
export function ProposalDocument(props: ProposalDocumentProps) {
  const totals = proposalTotals(props.lineItems);

  return (
    <article className="mx-auto max-w-3xl rounded-2xl border border-border bg-surface p-6 shadow-raised sm:p-10 print:border-0 print:shadow-none">
      <header className="border-b border-border pb-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-faint">
          Proposal for {props.preparedFor}
          {props.preparedBy ? ` · from ${props.preparedBy}` : ""}
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-[-0.02em] text-ink sm:text-4xl">{props.title}</h1>
        {props.summary && <p className="mt-4 whitespace-pre-line text-base leading-relaxed text-ink-muted">{props.summary}</p>}
      </header>

      {props.sections
        .filter((section) => section.body.trim())
        .map((section, index) => (
          <section key={index} className="border-b border-border py-6">
            {section.heading && <h2 className="font-display text-lg font-semibold text-ink">{section.heading}</h2>}
            <p className="mt-2 whitespace-pre-line leading-relaxed text-ink-muted">{section.body}</p>
          </section>
        ))}

      <section className="border-b border-border py-6" aria-labelledby="investment-heading">
        <h2 id="investment-heading" className="font-display text-lg font-semibold text-ink">
          Investment
        </h2>
        <table className="mt-3 w-full text-left text-sm">
          <tbody>
            {props.lineItems.map((item, index) => (
              <tr key={index} className="border-b border-border last:border-0">
                <td className="py-2.5 pr-4 text-ink">{item.description}</td>
                <td className="whitespace-nowrap py-2.5 text-right font-medium text-ink" data-numeric>
                  {item.amountUsd === null ? "-" : usd.format(item.amountUsd)}
                  {item.billing === "monthly" ? " / month" : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="mt-4 flex flex-col items-end gap-1 text-sm">
          {totals.oneTime > 0 && (
            <div className="flex gap-3">
              <dt className="text-ink-muted">One-time total</dt>
              <dd className="font-semibold text-ink">{usd.format(totals.oneTime)}</dd>
            </div>
          )}
          {totals.monthly > 0 && (
            <div className="flex gap-3">
              <dt className="text-ink-muted">Monthly</dt>
              <dd className="font-semibold text-ink">{usd.format(totals.monthly)} / month</dd>
            </div>
          )}
        </dl>
        {(totals.oneTime > 0 || totals.monthly > 0) && (
          <p className="mt-4 text-sm text-ink-muted">
            Due on acceptance:{" "}
            {[
              totals.oneTime > 0 && props.depositPercent > 0
                ? `${usd.format(depositUsd(totals.oneTime, props.depositPercent))}${props.depositPercent < 100 ? ` (${props.depositPercent}% of the one-time total; the rest when the work is done)` : ""}`
                : null,
              totals.monthly > 0 ? `the first month of ${usd.format(totals.monthly)}` : null,
            ]
              .filter(Boolean)
              .join(", plus ") || "nothing - the one-time total is billed when the work is done"}
            .
          </p>
        )}
      </section>

      {props.terms.trim() && (
        <section className="py-6">
          <h2 className="font-display text-lg font-semibold text-ink">Terms</h2>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-muted">{props.terms}</p>
        </section>
      )}

      {props.validUntil && (
        <p className="text-sm text-ink-faint">
          Valid until{" "}
          {props.validUntil.toLocaleDateString("en-US", { dateStyle: "long", timeZone: "America/Los_Angeles" })}.
        </p>
      )}
    </article>
  );
}
