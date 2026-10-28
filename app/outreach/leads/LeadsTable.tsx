"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { BlueprintCard } from "@/components/outreach/BlueprintCard";
import { Table, Th, Td, Tr } from "@/components/outreach/Table";
import { cn } from "@/lib/cn";
import { useUIStore } from "@/store/uiStore";
import type { leads } from "@/db/schema";

type LeadRow = typeof leads.$inferSelect;

interface CampaignOption {
  id: string;
  name: string;
  status: string;
}

const SOURCE_LABELS: Record<string, string> = { gmaps: "Maps", scout: "Scout", csv: "CSV" };

function displayHost(website: string): string {
  try {
    return new URL(website).hostname.replace(/^www\./, "");
  } catch {
    return website;
  }
}

function SelectBox({ checked, label, onToggle }: { checked: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      className={cn(
        "relative block h-3.5 w-3.5 border-[1.5px]",
        checked ? "border-signal bg-signal-soft" : "border-border-strong",
      )}
    >
      {checked && <span className="absolute inset-[3px] bg-signal" />}
    </button>
  );
}

export function LeadsTable({ rows, campaigns }: { rows: LeadRow[]; campaigns: CampaignOption[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const showToast = useUIStore((state) => state.showToast);

  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id));
  const selectedRows = rows.filter((row) => selected.has(row.id));
  const selectedWithEmail = selectedRows.filter((row) => row.email && row.status !== "disqualified").length;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const post = async (url: string, payload: unknown) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return { ok: response.ok, body: await response.json() };
  };

  const enroll = async () => {
    if (!campaignId) return;
    setBusy(true);
    try {
      const { ok, body } = await post("/api/outreach/leads/enroll", { campaignId, leadIds: [...selected] });
      if (!ok) {
        showToast("error", typeof body.error === "string" ? body.error : "Could not add these leads.");
        return;
      }
      const skipped = [
        body.skippedNoEmail > 0 && `${body.skippedNoEmail} without an email`,
        body.skippedSuppressed > 0 && `${body.skippedSuppressed} suppressed`,
      ].filter(Boolean);
      showToast(
        "success",
        `Added ${body.enrolled} lead${body.enrolled === 1 ? "" : "s"} to the campaign.${skipped.length ? ` Skipped ${skipped.join(", ")}.` : ""}`,
      );
      if (body.schedulingWarning) showToast("warning", body.schedulingWarning);
      setSelected(new Set());
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (status: "new" | "disqualified") => {
    setBusy(true);
    try {
      const { ok, body } = await post("/api/outreach/leads/status", { leadIds: [...selected], status });
      if (!ok) {
        showToast("error", "Could not update these leads.");
        return;
      }
      showToast("success", `${status === "disqualified" ? "Disqualified" : "Restored"} ${body.updated} lead${body.updated === 1 ? "" : "s"}.`);
      setSelected(new Set());
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 border border-signal bg-signal-soft px-4 py-2">
          <span className="text-[13px] font-medium">
            {selected.size} selected <span className="text-ink-muted">({selectedWithEmail} with email)</span>
          </span>
          <span className="h-4 w-px bg-border" />
          {campaigns.length === 0 ? (
            <span className="text-[13px] text-ink-muted">Create a campaign first to add leads to it.</span>
          ) : (
            <>
              <label className="sr-only" htmlFor="enroll-campaign">
                Campaign
              </label>
              <select
                id="enroll-campaign"
                value={campaignId}
                onChange={(event) => setCampaignId(event.target.value)}
                className="min-h-9 max-w-[240px] rounded-md border border-border-strong bg-surface px-2 text-[13px] text-ink"
              >
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name} ({campaign.status})
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={busy || selectedWithEmail === 0}
                onClick={enroll}
                className="text-[13px] font-medium text-signal-strong disabled:opacity-50"
              >
                Add to campaign
              </button>
            </>
          )}
          <span className="h-4 w-px bg-border" />
          <button type="button" disabled={busy} onClick={() => setStatus("disqualified")} className="text-[13px] text-signal-strong disabled:opacity-50">
            Disqualify
          </button>
          <button type="button" disabled={busy} onClick={() => setStatus("new")} className="text-[13px] text-signal-strong disabled:opacity-50">
            Restore
          </button>
          <div className="flex-1" />
          <button type="button" onClick={() => setSelected(new Set())} className="text-[12.5px] text-ink-faint">
            Clear
          </button>
        </div>
      )}

      <BlueprintCard noPadding className="overflow-x-auto">
        <Table style={{ minWidth: 980 }}>
          <thead>
            <tr>
              <Th style={{ width: 38 }}>
                <SelectBox
                  checked={allSelected}
                  label={allSelected ? "Deselect all leads on this page" : "Select all leads on this page"}
                  onToggle={() => setSelected(allSelected ? new Set() : new Set(rows.map((row) => row.id)))}
                />
              </Th>
              <Th>Business</Th>
              <Th>Email</Th>
              <Th>Phone</Th>
              <Th>Website</Th>
              <Th align="right">Rating</Th>
              <Th align="right">Score</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Tr key={row.id}>
                <Td>
                  <SelectBox
                    checked={selected.has(row.id)}
                    label={selected.has(row.id) ? `Deselect ${row.name}` : `Select ${row.name}`}
                    onToggle={() => toggle(row.id)}
                  />
                </Td>
                <Td>
                  <div className="max-w-[260px]">
                    <p className="truncate font-medium text-ink" title={row.name}>
                      {row.name}
                    </p>
                    <p className="truncate text-xs text-ink-faint">
                      {[SOURCE_LABELS[row.source] ?? row.source, row.category, row.contactName].filter(Boolean).join(" · ")}
                    </p>
                    {row.icebreaker && (
                      <p className="truncate text-xs text-signal-strong" title={row.icebreaker}>
                        Icebreaker approved
                      </p>
                    )}
                  </div>
                </Td>
                <Td>
                  {row.email ? (
                    <div className="max-w-[220px]">
                      <p className="truncate text-ink" title={row.email}>
                        {row.email}
                      </p>
                      {row.emailSource && <p className="text-xs text-ink-faint">from {row.emailSource}</p>}
                    </div>
                  ) : (
                    <span className="text-ink-faint">—</span>
                  )}
                </Td>
                <Td numeric className="whitespace-nowrap text-ink-muted">
                  {row.phone ?? "—"}
                </Td>
                <Td>
                  {row.website ? (
                    <a
                      href={row.website}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="block max-w-[180px] truncate text-signal-strong hover:underline"
                    >
                      {displayHost(row.website)}
                    </a>
                  ) : row.profileUrl ? (
                    <a
                      href={row.profileUrl}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="block max-w-[180px] truncate text-signal-strong hover:underline"
                    >
                      {row.platform ?? "profile"}
                    </a>
                  ) : (
                    <span className="text-ink-faint">—</span>
                  )}
                </Td>
                <Td align="right" numeric className="whitespace-nowrap text-ink-muted">
                  {row.rating !== null ? `${row.rating.toFixed(1)} (${row.reviewCount ?? 0})` : "—"}
                </Td>
                <Td align="right" numeric className="font-semibold text-ink">
                  {row.score}
                </Td>
                <Td>
                  <StatusBadge status={row.status} />
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </BlueprintCard>
    </div>
  );
}
