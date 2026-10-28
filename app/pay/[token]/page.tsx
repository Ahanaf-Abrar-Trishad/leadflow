import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { deals } from "@/db/schema";
import { getInvoiceByToken } from "@/lib/billing/invoices";
import { formatCents, INVOICE_KIND_LABELS } from "@/lib/billing/money";
import { stripeEnabled } from "@/lib/billing/stripe";
import { PayButton } from "./PayButton";

/*
 * Public pay page, keyed by the signed pay token (outside proxy.ts's gate).
 * A forged, revoked or voided link shows the same "no longer valid" page.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Invoice", robots: { index: false, follow: false } };

export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ paid?: string }>;
}) {
  const [{ token }, { paid }] = await Promise.all([params, searchParams]);
  const invoice = await getInvoiceByToken(token);

  if (!invoice) {
    return (
      <main id="main-content" className="mx-auto w-full max-w-lg px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-bold text-ink">This link is no longer valid</h1>
        <p className="mt-3 text-sm text-ink-muted">Reply to our last email and we will send you a current invoice.</p>
      </main>
    );
  }

  const [deal] = await db.select({ title: deals.title }).from(deals).where(eq(deals.id, invoice.dealId));
  const instructions = process.env.PAYMENT_INSTRUCTIONS?.replace(/\\n/g, "\n").trim();
  const agency = process.env.AGENCY_NAME?.trim();
  const isMonthly = invoice.kind === "monthly";

  return (
    <main id="main-content" className="w-full px-4 py-12 sm:py-20">
      <article className="mx-auto max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-raised sm:p-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-faint">
          Invoice for {deal?.title ?? "you"}
          {agency ? ` · from ${agency}` : ""}
        </p>
        <h1 className="mt-2 font-display text-2xl font-bold text-ink">{invoice.description}</h1>
        <p className="mt-4 font-display text-4xl font-bold text-ink" data-numeric>
          {formatCents(invoice.amountCents)}
          {isMonthly && <span className="text-lg font-medium text-ink-muted"> / month</span>}
        </p>
        <p className="mt-1 text-sm text-ink-muted">{INVOICE_KIND_LABELS[invoice.kind] ?? invoice.kind}</p>

        <div className="mt-6 border-t border-border pt-6">
          {invoice.status === "paid" ? (
            <p className="rounded-xl bg-signal-soft p-4 text-sm text-ink">
              Paid{invoice.paidAt ? ` on ${invoice.paidAt.toLocaleDateString("en-US", { dateStyle: "long" })}` : ""}. Thank you!
            </p>
          ) : invoice.status === "processing" || paid ? (
            <p className="rounded-xl bg-paper p-4 text-sm text-ink">
              Thank you - your payment is being processed. Bank payments can take a few business days to clear; we will
              confirm by email.
            </p>
          ) : (
            <div className="flex flex-col gap-5">
              {stripeEnabled() && (
                <div>
                  <PayButton token={token} label={isMonthly ? "Start monthly payments" : "Pay by card or bank"} />
                  <p className="mt-2 text-xs text-ink-faint">
                    Secure checkout by Stripe.{isMonthly ? " Billed monthly; cancel with 30 days' notice." : ""}
                  </p>
                </div>
              )}
              {instructions && (
                <div>
                  <h2 className="text-sm font-semibold text-ink">{stripeEnabled() ? "Or pay by transfer" : "How to pay"}</h2>
                  <p className="mt-1 whitespace-pre-line text-sm text-ink-muted">{instructions}</p>
                </div>
              )}
              {!stripeEnabled() && !instructions && (
                <p className="text-sm text-ink-muted">Reply to our email and we will send payment details.</p>
              )}
            </div>
          )}
        </div>
      </article>
    </main>
  );
}
