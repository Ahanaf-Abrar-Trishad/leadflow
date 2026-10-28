"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUIStore } from "@/store/uiStore";
import { DEAL_STAGES, STAGE_LABELS, type DealStage } from "@/lib/deals/stages";

export interface DealCardData {
  id: string;
  title: string;
  stage: string;
  valueUsd: number | null;
  notes: string;
  lostReason: string | null;
  enrollmentId: string | null;
  contactEmail: string;
  stageChangedAt: string;
}

const inputClass =
  "w-full rounded-md border border-border-strong bg-surface px-2 py-1 text-[13px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal";

function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

export function DealCard({ deal }: { deal: DealCardData }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(deal.valueUsd?.toString() ?? "");
  const [notes, setNotes] = useState(deal.notes);
  const [lostReason, setLostReason] = useState(deal.lostReason ?? "");
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const showToast = useUIStore((state) => state.showToast);

  const save = async (patch: Record<string, unknown>, message?: string) => {
    setSaving(true);
    try {
      const response = await fetch(`/api/outreach/deals/${deal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!response.ok) {
        showToast("error", "Could not save the deal.");
        return;
      }
      if (message) showToast("success", message);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const openProposal = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/outreach/deals/${deal.id}/proposal`, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.id) {
        showToast("error", "Could not open a proposal for this deal.");
        return;
      }
      router.push(`/outreach/proposals/${body.id}`);
    } finally {
      setSaving(false);
    }
  };

  const parsedValue = value.trim() === "" ? null : Number(value);
  const valueValid = parsedValue === null || (Number.isInteger(parsedValue) && parsedValue >= 0);
  const days = daysSince(deal.stageChangedAt);
  const idPrefix = `deal-${deal.id}`;

  return (
    <article className="blueprint p-3">
      <i className="corner tl" aria-hidden="true" />
      <i className="corner tr" aria-hidden="true" />
      <i className="corner bl" aria-hidden="true" />
      <i className="corner br" aria-hidden="true" />

      <p className="truncate font-medium text-ink" title={deal.title}>
        {deal.title}
      </p>
      <p className="truncate text-xs text-ink-faint" title={deal.contactEmail}>
        {deal.contactEmail}
      </p>
      <p className="mt-1 text-xs text-ink-muted">
        {deal.valueUsd !== null ? `$${deal.valueUsd.toLocaleString("en-US")} · ` : ""}
        {days === 0 ? "moved today" : `${days}d in stage`}
      </p>

      <label htmlFor={`${idPrefix}-stage`} className="sr-only">
        Stage
      </label>
      <select
        id={`${idPrefix}-stage`}
        value={deal.stage}
        disabled={saving}
        onChange={(event) =>
          save({ stage: event.target.value as DealStage }, `Moved to ${STAGE_LABELS[event.target.value as DealStage]}.`)
        }
        className={`${inputClass} mt-2`}
      >
        {DEAL_STAGES.map((stage) => (
          <option key={stage} value={stage}>
            {STAGE_LABELS[stage]}
          </option>
        ))}
      </select>

      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
        {deal.enrollmentId ? (
          <Link href={`/outreach/replies?thread=${deal.enrollmentId}`} className="text-signal-strong hover:underline">
            Conversation
          </Link>
        ) : (
          <span />
        )}
        <span className="flex gap-3">
          {deal.stage !== "lost" && (
            <button type="button" disabled={saving} onClick={openProposal} className="text-signal-strong hover:underline">
              Proposal
            </button>
          )}
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="text-ink-muted hover:text-ink">
            {open ? "Close" : "Details"}
          </button>
        </span>
      </div>

      {open && (
        <div className="mt-2 flex flex-col gap-2 border-t border-border pt-2">
          <label htmlFor={`${idPrefix}-value`} className="text-xs text-ink-muted">
            Value (USD)
            <input
              id={`${idPrefix}-value`}
              inputMode="numeric"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="e.g. 2500"
              className={`${inputClass} mt-0.5`}
            />
          </label>
          {deal.stage === "lost" && (
            <label htmlFor={`${idPrefix}-lost`} className="text-xs text-ink-muted">
              Why lost
              <input
                id={`${idPrefix}-lost`}
                value={lostReason}
                onChange={(event) => setLostReason(event.target.value)}
                className={`${inputClass} mt-0.5`}
              />
            </label>
          )}
          <label htmlFor={`${idPrefix}-notes`} className="text-xs text-ink-muted">
            Notes
            <textarea
              id={`${idPrefix}-notes`}
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className={`${inputClass} mt-0.5`}
            />
          </label>
          {!valueValid && <p className="text-xs text-danger">Value must be a whole number of dollars.</p>}
          <button
            type="button"
            disabled={saving || !valueValid}
            onClick={() =>
              save(
                { valueUsd: parsedValue, notes, ...(deal.stage === "lost" ? { lostReason: lostReason || null } : {}) },
                "Deal saved.",
              )
            }
            className="self-start rounded-md bg-signal px-3 py-1 text-[13px] font-medium text-white disabled:opacity-50"
          >
            Save
          </button>
        </div>
      )}
    </article>
  );
}
