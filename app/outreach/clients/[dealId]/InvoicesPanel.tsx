"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/shared/Button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { BlueprintCard } from "@/components/outreach/BlueprintCard";
import { useUIStore } from "@/store/uiStore";
import { formatCents, INVOICE_KIND_LABELS } from "@/lib/billing/money";

export interface InvoiceView {
  id: string;
  kind: string;
  description: string;
  amountCents: number;
  status: string;
  method: string | null;
  note: string | null;
  paidAt: string | null;
  url: string | null;
}

const sectionTitle = "mb-3 font-display text-sm font-semibold uppercase tracking-wide text-ink-muted";

export function InvoicesPanel({
  dealId,
  invoices,
  canEmail,
  stripe,
  defaultMessage,
}: {
  dealId: string;
  invoices: InvoiceView[];
  canEmail: boolean;
  stripe: boolean;
  defaultMessage: string;
}) {
  const [busy, setBusy] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [message, setMessage] = useState(defaultMessage);
  const router = useRouter();
  const showToast = useUIStore((state) => state.showToast);

  const call = async (path: string, body: unknown, success: string) => {
    setBusy(true);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        showToast("error", typeof result.error === "string" ? result.error : "That did not work.");
        return false;
      }
      showToast("success", success);
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  };

  const copy = (url: string) =>
    navigator.clipboard.writeText(url).then(
      () => showToast("success", "Pay link copied."),
      () => showToast("error", "Could not copy the link."),
    );

  const hasBalance = invoices.some((invoice) => invoice.kind === "balance" && invoice.status !== "void");
  const hasDeposit = invoices.some((invoice) => invoice.kind === "deposit");

  return (
    <BlueprintCard>
      <h2 className={sectionTitle}>Invoices</h2>
      {!stripe && (
        <p className="mb-3 text-xs text-ink-faint">
          Card payments are off (no STRIPE_SECRET_KEY). Clients see your PAYMENT_INSTRUCTIONS; mark invoices paid by hand.
        </p>
      )}
      {invoices.length === 0 ? (
        <p className="text-sm text-ink-muted">No invoices yet. They are created when the client signs a proposal.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {invoices.map((invoice) => (
            <li key={invoice.id} className="py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-ink">
                    {INVOICE_KIND_LABELS[invoice.kind] ?? invoice.kind}: {formatCents(invoice.amountCents)}
                    {invoice.kind === "monthly" ? " / month" : ""}
                  </p>
                  <p className="text-xs text-ink-faint">{invoice.description}</p>
                  {invoice.paidAt && (
                    <p className="text-xs text-ink-muted">
                      Paid {new Date(invoice.paidAt).toLocaleDateString()} {invoice.method === "manual" ? "(marked by hand)" : "(Stripe)"}
                    </p>
                  )}
                  {invoice.note && <p className="text-xs text-ink-muted">{invoice.note}</p>}
                </div>
                <StatusBadge status={invoice.status} />
              </div>
              {(invoice.status === "open" || invoice.status === "processing") && (
                <div className="mt-2 flex flex-wrap gap-2 text-sm">
                  {invoice.url && invoice.status === "open" && (
                    <>
                      <Button variant="secondary" disabled={busy} onClick={() => copy(invoice.url!)}>
                        Copy pay link
                      </Button>
                      {canEmail && (
                        <Button variant="secondary" disabled={busy} onClick={() => setSendingId(sendingId === invoice.id ? null : invoice.id)}>
                          Email pay link
                        </Button>
                      )}
                    </>
                  )}
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => {
                      const note = window.prompt("How was it paid? (e.g. Wire received Nov 3)", "");
                      if (note !== null) void call(`/api/outreach/invoices/${invoice.id}/mark-paid`, { note }, "Marked paid.");
                    }}
                  >
                    Mark paid
                  </Button>
                  <Button
                    variant="danger"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm("Void this invoice? Its pay link stops working.")) {
                        void call(`/api/outreach/invoices/${invoice.id}/void`, {}, "Invoice voided.");
                      }
                    }}
                  >
                    Void
                  </Button>
                </div>
              )}
              {sendingId === invoice.id && (
                <div className="mt-3 flex flex-col gap-2">
                  <label htmlFor={`message-${invoice.id}`} className="text-sm font-medium text-ink">
                    Email message (the pay link is added below it)
                  </label>
                  <textarea
                    id={`message-${invoice.id}`}
                    rows={4}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink"
                  />
                  <Button
                    className="self-start"
                    disabled={busy || !message.trim()}
                    onClick={async () => {
                      if (await call(`/api/outreach/invoices/${invoice.id}/send`, { message }, "Pay link sent.")) setSendingId(null);
                    }}
                  >
                    Send
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {hasDeposit && !hasBalance && (
        <div className="mt-4 border-t border-border pt-4">
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              if (window.confirm("Bill the remaining balance now? Do this when the work is done.")) {
                void call(`/api/outreach/clients/${dealId}/bill-balance`, {}, "Balance invoice created.");
              }
            }}
          >
            Work done: bill the balance
          </Button>
        </div>
      )}
    </BlueprintCard>
  );
}
