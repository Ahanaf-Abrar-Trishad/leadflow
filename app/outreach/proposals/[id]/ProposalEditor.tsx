"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/shared/Button";
import { BlueprintCard } from "@/components/outreach/BlueprintCard";
import { useUIStore } from "@/store/uiStore";
import type { ProposalLineItem, ProposalSection } from "@/db/schema";
import { depositUsd, MAX_LINE_ITEMS, MAX_SECTIONS, proposalTotals, usd } from "@/lib/proposals/content";

export interface EditableProposal {
  id: string;
  status: string;
  title: string;
  summary: string;
  sections: ProposalSection[];
  lineItems: ProposalLineItem[];
  terms: string;
  /** yyyy-mm-dd or "". */
  validUntil: string;
  depositPercent: number;
  viewCount: number;
  lastViewedAt: string | null;
  signerName: string | null;
  signerEmail: string | null;
  signerIp: string | null;
  acceptedAt: string | null;
  declineReason: string | null;
}

const inputClass =
  "w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal disabled:bg-paper disabled:text-ink-muted";
const labelClass = "text-sm font-medium text-ink";
const sectionTitle = "mb-3 font-display text-sm font-semibold uppercase tracking-wide text-ink-muted";

export function ProposalEditor({
  proposal,
  url,
  problems,
  canEmail,
  defaultMessage,
}: {
  proposal: EditableProposal;
  url: string | null;
  problems: string[];
  canEmail: boolean;
  defaultMessage: string;
}) {
  const [title, setTitle] = useState(proposal.title);
  const [summary, setSummary] = useState(proposal.summary);
  const [sections, setSections] = useState(proposal.sections);
  const [lineItems, setLineItems] = useState(proposal.lineItems);
  const [terms, setTerms] = useState(proposal.terms);
  const [validUntil, setValidUntil] = useState(proposal.validUntil);
  const [depositPercent, setDepositPercent] = useState(String(proposal.depositPercent));
  const [message, setMessage] = useState(defaultMessage);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const showToast = useUIStore((state) => state.showToast);

  const editable = proposal.status === "draft";
  const totals = proposalTotals(lineItems);
  const touch = () => setDirty(true);

  const request = async (path: string, method: string, body?: unknown) => {
    const response = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    return { ok: response.ok, result };
  };

  const save = async (): Promise<boolean> => {
    const { ok, result } = await request(`/api/outreach/proposals/${proposal.id}`, "PUT", {
      title,
      summary,
      sections,
      lineItems,
      terms,
      validUntil: validUntil || null,
      depositPercent: Number(depositPercent) || 0,
    });
    if (!ok) {
      showToast("error", typeof result.error === "string" ? result.error : "Could not save. Check the fields.");
      return false;
    }
    setDirty(false);
    return true;
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  const onSave = () =>
    run(async () => {
      if (await save()) {
        showToast("success", "Proposal saved.");
        router.refresh();
      }
    });

  const onSend = (mode: "link" | "email") =>
    run(async () => {
      if (dirty && !(await save())) return;
      const { ok, result } = await request(
        `/api/outreach/proposals/${proposal.id}/send`,
        "POST",
        mode === "email" ? { mode, message } : { mode },
      );
      if (result.url && mode === "link") await navigator.clipboard.writeText(result.url).catch(() => undefined);
      if (!ok) {
        showToast("error", typeof result.error === "string" ? result.error : "Could not send the proposal.");
      } else {
        showToast("success", mode === "email" ? "Proposal sent in the conversation." : "Proposal is live. Link copied.");
      }
      router.refresh();
    });

  const onRevoke = (to: "draft" | "withdrawn") =>
    run(async () => {
      const { ok, result } = await request(`/api/outreach/proposals/${proposal.id}/revoke`, "POST", { to });
      if (!ok) showToast("error", typeof result.error === "string" ? result.error : "Could not change the proposal.");
      else showToast("success", to === "draft" ? "Back to draft. The old link no longer works." : "Proposal withdrawn.");
      router.refresh();
    });

  const copyLink = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url).then(
      () => showToast("success", "Link copied."),
      () => showToast("error", "Could not copy. Select the link and copy it by hand."),
    );
  };

  return (
    <div className="flex flex-col gap-6">
      {proposal.status === "accepted" && (
        <BlueprintCard>
          <h2 className={sectionTitle}>Signature</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-ink-muted">Signed by</dt>
            <dd className="text-ink">{proposal.signerName}</dd>
            <dt className="text-ink-muted">Email</dt>
            <dd className="text-ink">{proposal.signerEmail}</dd>
            <dt className="text-ink-muted">When</dt>
            <dd className="text-ink">{proposal.acceptedAt && new Date(proposal.acceptedAt).toLocaleString()}</dd>
            <dt className="text-ink-muted">IP address</dt>
            <dd className="text-ink">{proposal.signerIp ?? "unknown"}</dd>
          </dl>
          <p className="mt-3 text-xs text-ink-faint">
            An exact copy of the proposal as signed is stored with the signature.{" "}
            <Link href={`/outreach/proposals/${proposal.id}/preview`} className="text-signal-strong hover:underline">
              View signed version
            </Link>
          </p>
        </BlueprintCard>
      )}

      {proposal.status === "declined" && (
        <BlueprintCard>
          <p className="text-sm text-ink">
            The client declined this proposal{proposal.declineReason ? `: "${proposal.declineReason}"` : "."}
          </p>
        </BlueprintCard>
      )}

      {proposal.status === "sent" && url && (
        <BlueprintCard>
          <h2 className={sectionTitle}>Live link</h2>
          <div className="flex items-start gap-2">
            <code className="min-w-0 flex-1 break-all rounded-md border border-border bg-paper p-2 font-mono text-xs text-ink [font-variant-ligatures:none]">
              {url}
            </code>
            <Button variant="secondary" onClick={copyLink}>
              Copy
            </Button>
          </div>
          <p className="mt-2 text-sm text-ink-muted">
            Viewed {proposal.viewCount} time{proposal.viewCount === 1 ? "" : "s"}
            {proposal.lastViewedAt ? `, last on ${new Date(proposal.lastViewedAt).toLocaleString()}` : ""}.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" disabled={busy} onClick={() => onRevoke("draft")}>
              Back to draft to edit
            </Button>
            <Button variant="danger" disabled={busy} onClick={() => onRevoke("withdrawn")}>
              Withdraw
            </Button>
          </div>
          <p className="mt-2 text-xs text-ink-faint">Either one stops the current link from working.</p>
        </BlueprintCard>
      )}

      <BlueprintCard>
        <h2 className={sectionTitle}>Content</h2>
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Title</span>
            <input className={inputClass} disabled={!editable} value={title} onChange={(e) => (setTitle(e.target.value), touch())} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Summary</span>
            <textarea
              className={inputClass}
              rows={3}
              disabled={!editable}
              value={summary}
              onChange={(e) => (setSummary(e.target.value), touch())}
            />
          </label>
          {sections.map((section, index) => (
            <fieldset key={index} className="flex flex-col gap-2 rounded-md border border-border p-3">
              <legend className="px-1 text-xs text-ink-faint">Section {index + 1}</legend>
              <input
                aria-label={`Section ${index + 1} heading`}
                className={inputClass}
                disabled={!editable}
                value={section.heading}
                placeholder="Heading"
                onChange={(e) => {
                  setSections(sections.map((s, i) => (i === index ? { ...s, heading: e.target.value } : s)));
                  touch();
                }}
              />
              <textarea
                aria-label={`Section ${index + 1} text`}
                className={inputClass}
                rows={5}
                disabled={!editable}
                value={section.body}
                onChange={(e) => {
                  setSections(sections.map((s, i) => (i === index ? { ...s, body: e.target.value } : s)));
                  touch();
                }}
              />
              {editable && (
                <button
                  type="button"
                  className="self-start text-xs text-ink-muted underline"
                  onClick={() => (setSections(sections.filter((_, i) => i !== index)), touch())}
                >
                  Remove section
                </button>
              )}
            </fieldset>
          ))}
          {editable && sections.length < MAX_SECTIONS && (
            <button
              type="button"
              className="self-start text-sm text-signal-strong"
              onClick={() => (setSections([...sections, { heading: "", body: "" }]), touch())}
            >
              + Add section
            </button>
          )}
        </div>
      </BlueprintCard>

      <BlueprintCard>
        <h2 className={sectionTitle}>Pricing</h2>
        <p className="mb-3 text-sm text-ink-muted">You set every price. Whole US dollars.</p>
        <div className="flex flex-col gap-2">
          {lineItems.map((item, index) => (
            <div key={index} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_120px_130px_auto] sm:items-center">
              <input
                aria-label={`Line item ${index + 1} description`}
                className={inputClass}
                disabled={!editable}
                value={item.description}
                placeholder="e.g. Website redesign (6 pages)"
                onChange={(e) => {
                  setLineItems(lineItems.map((li, i) => (i === index ? { ...li, description: e.target.value } : li)));
                  touch();
                }}
              />
              <input
                aria-label={`Line item ${index + 1} price in USD`}
                className={inputClass}
                inputMode="numeric"
                disabled={!editable}
                value={item.amountUsd ?? ""}
                placeholder="Price"
                onChange={(e) => {
                  const digits = e.target.value.replace(/[^\d]/g, "");
                  setLineItems(
                    lineItems.map((li, i) => (i === index ? { ...li, amountUsd: digits ? Number(digits) : null } : li)),
                  );
                  touch();
                }}
              />
              <select
                aria-label={`Line item ${index + 1} billing`}
                className={inputClass}
                disabled={!editable}
                value={item.billing}
                onChange={(e) => {
                  setLineItems(
                    lineItems.map((li, i) => (i === index ? { ...li, billing: e.target.value as ProposalLineItem["billing"] } : li)),
                  );
                  touch();
                }}
              >
                <option value="one_time">One-time</option>
                <option value="monthly">Monthly</option>
              </select>
              {editable && (
                <button
                  type="button"
                  className="text-xs text-ink-muted underline"
                  onClick={() => (setLineItems(lineItems.filter((_, i) => i !== index)), touch())}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          {editable && lineItems.length < MAX_LINE_ITEMS && (
            <button
              type="button"
              className="self-start text-sm text-signal-strong"
              onClick={() => (setLineItems([...lineItems, { description: "", amountUsd: null, billing: "one_time" }]), touch())}
            >
              + Add line item
            </button>
          )}
          <p className="mt-2 text-right text-sm text-ink">
            {totals.oneTime > 0 && <>One-time {usd.format(totals.oneTime)}</>}
            {totals.oneTime > 0 && totals.monthly > 0 && " · "}
            {totals.monthly > 0 && <>Monthly {usd.format(totals.monthly)}</>}
          </p>
          <label className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink">
            Due on acceptance
            <input
              aria-label="Deposit percent of the one-time total"
              className={`${inputClass} w-20`}
              inputMode="numeric"
              disabled={!editable}
              value={depositPercent}
              onChange={(e) => (setDepositPercent(e.target.value.replace(/[^\d]/g, "").slice(0, 3)), touch())}
            />
            % of the one-time total
            {totals.oneTime > 0 && (
              <span className="text-ink-muted">
                = {usd.format(depositUsd(totals.oneTime, Math.min(Number(depositPercent) || 0, 100)))} now, the rest when
                the work is done
              </span>
            )}
          </label>
          {Number(depositPercent) > 100 && <p className="text-xs text-danger">The deposit cannot be more than 100%.</p>}
        </div>
      </BlueprintCard>

      <BlueprintCard>
        <h2 className={sectionTitle}>Terms and validity</h2>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Terms</span>
          <textarea className={inputClass} rows={6} disabled={!editable} value={terms} onChange={(e) => (setTerms(e.target.value), touch())} />
        </label>
        <label className="mt-3 flex flex-col gap-1 sm:w-56">
          <span className={labelClass}>Valid until</span>
          <input
            type="date"
            className={inputClass}
            disabled={!editable}
            value={validUntil}
            onChange={(e) => (setValidUntil(e.target.value), touch())}
          />
        </label>
      </BlueprintCard>

      {editable && (
        <BlueprintCard>
          <h2 className={sectionTitle}>Send</h2>
          {problems.length > 0 && !dirty && (
            <ul className="mb-3 list-disc pl-5 text-sm text-danger">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Email message (the link is added below it)</span>
            <textarea className={inputClass} rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button disabled={busy} onClick={onSave} variant="secondary">
              {dirty ? "Save changes" : "Saved"}
            </Button>
            <Link
              href={`/outreach/proposals/${proposal.id}/preview`}
              target="_blank"
              className="inline-flex min-h-11 items-center rounded-md border border-border-strong bg-surface px-4 text-sm font-medium text-ink hover:bg-paper"
            >
              Preview
            </Link>
            <Button disabled={busy || !canEmail || !message.trim()} onClick={() => onSend("email")}>
              Send in conversation
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => onSend("link")}>
              Make live and copy link
            </Button>
          </div>
          {!canEmail && (
            <p className="mt-2 text-xs text-ink-faint">This deal has no email conversation; share the link yourself.</p>
          )}
        </BlueprintCard>
      )}
    </div>
  );
}
