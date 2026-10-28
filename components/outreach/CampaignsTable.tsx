"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { BlueprintCard } from "@/components/outreach/BlueprintCard";
import { Table, Th, Td, Tr } from "@/components/outreach/Table";
import { cn } from "@/lib/cn";
import { useUIStore } from "@/store/uiStore";
import { campaignNeedsAttention } from "@/lib/outreach/campaigns/attention";
import type { CampaignPerformanceRow } from "@/lib/outreach/dashboard/queries";

type ViewKey = "all" | "attention" | "active" | "replied" | "drafts";

const VIEWS: { key: ViewKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "attention", label: "Needs attention" },
  { key: "active", label: "Active" },
  { key: "replied", label: "Replied" },
  { key: "drafts", label: "Drafts" },
];

function matchesView(row: CampaignPerformanceRow, view: ViewKey): boolean {
  switch (view) {
    case "attention":
      return campaignNeedsAttention(row);
    case "active":
      return row.status === "active";
    case "replied":
      return row.replied > 0;
    case "drafts":
      return row.status === "draft";
    default:
      return true;
  }
}

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

export function CampaignsTable({ rows }: { rows: CampaignPerformanceRow[] }) {
  const [view, setView] = useState<ViewKey>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const showToast = useUIStore((state) => state.showToast);

  const counts = useMemo(() => {
    const c: Record<ViewKey, number> = { all: rows.length, attention: 0, active: 0, replied: 0, drafts: 0 };
    for (const row of rows) {
      if (matchesView(row, "attention")) c.attention += 1;
      if (matchesView(row, "active")) c.active += 1;
      if (matchesView(row, "replied")) c.replied += 1;
      if (matchesView(row, "drafts")) c.drafts += 1;
    }
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => matchesView(row, view) && (needle === "" || row.name.toLowerCase().includes(needle)));
  }, [rows, view, query]);

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedRows = rows.filter((row) => selected.has(row.id));

  const runBulk = async (action: "pause" | "resume") => {
    const targets = selectedRows.filter((row) => (action === "pause" ? row.status === "active" : row.status === "paused"));
    if (targets.length === 0) {
      showToast("error", `No selected campaigns are ${action === "pause" ? "active" : "paused"}.`);
      return;
    }

    setBusy(true);
    try {
      const results = await Promise.allSettled(
        targets.map((row) => fetch(`/api/outreach/campaigns/${row.id}/${action}`, { method: "PATCH" })),
      );
      const failed = results.filter((r) => r.status === "rejected" || !r.value.ok).length;
      if (failed > 0) showToast("error", `${failed} of ${targets.length} campaigns failed to ${action}.`);
      else showToast("success", `${action === "pause" ? "Paused" : "Resumed"} ${targets.length} campaign${targets.length === 1 ? "" : "s"}.`);
      setSelected(new Set());
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3.5">
        <div className="flex border border-border">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => setView(v.key)}
              className={cn(
                "border-r border-border px-3.5 py-1.5 font-display text-[13px] font-semibold uppercase tracking-[0.05em] last:border-r-0",
                view === v.key ? "bg-signal-soft text-signal-strong" : "text-ink-muted hover:bg-paper",
              )}
            >
              {v.label} <span className="font-sans font-normal opacity-60">{counts[v.key]}</span>
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <input
          type="text"
          placeholder="Filter campaigns"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="w-[220px] border border-border bg-transparent px-2.5 py-1.5 text-[12.5px] text-ink outline-none placeholder:text-ink-faint focus-visible:border-signal"
        />
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 border border-signal bg-signal-soft px-4 py-2">
          <span className="text-[13px] font-medium">{selected.size} selected</span>
          <span className="h-4 w-px bg-border" />
          <button type="button" disabled={busy} onClick={() => runBulk("pause")} className="text-[13px] text-signal-strong disabled:opacity-50">
            Pause
          </button>
          <button type="button" disabled={busy} onClick={() => runBulk("resume")} className="text-[13px] text-signal-strong disabled:opacity-50">
            Resume
          </button>
          <div className="flex-1" />
          <button type="button" onClick={() => setSelected(new Set())} className="text-[12.5px] text-ink-faint">
            Clear
          </button>
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState title="No campaigns match" description="Try a different filter or search term." />
      ) : (
        <BlueprintCard noPadding className="overflow-x-auto">
          <Table style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <Th style={{ width: 38 }} />
                <Th>Campaign</Th>
                <Th>Status</Th>
                <Th align="right">Enrolled</Th>
                <Th align="right">In flight</Th>
                <Th align="right">Replied</Th>
                <Th align="right">Bounced</Th>
                <Th align="right">Reply rate</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <Tr key={row.id}>
                  <Td>
                    <button
                      type="button"
                      aria-label={selected.has(row.id) ? `Deselect ${row.name}` : `Select ${row.name}`}
                      onClick={() => toggleRow(row.id)}
                      className={cn(
                        "relative block h-3.5 w-3.5 border-[1.5px]",
                        selected.has(row.id) ? "border-signal bg-signal-soft" : "border-border-strong",
                      )}
                    >
                      {selected.has(row.id) && <span className="absolute inset-[3px] bg-signal" />}
                    </button>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <Link href={`/outreach/campaigns/${row.id}`} className="text-[14px] font-medium text-ink">
                        {row.name}
                      </Link>
                      {campaignNeedsAttention(row) && (
                        <span className="text-[10px] uppercase tracking-[0.1em] text-danger">Attention</span>
                      )}
                    </div>
                  </Td>
                  <Td>
                    <StatusBadge status={row.status} />
                  </Td>
                  <Td align="right" numeric className="text-ink-muted">{row.enrolled}</Td>
                  <Td align="right" numeric className="text-ink-muted">{row.active}</Td>
                  <Td align="right" numeric className="font-semibold text-signal-strong">{row.replied}</Td>
                  <Td align="right" numeric className={row.bounced > 0 ? "text-danger" : "text-ink-muted"}>
                    {row.bounced}
                  </Td>
                  <Td align="right" numeric className="font-medium text-ink">{formatPercent(row.replyRate)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </BlueprintCard>
      )}
    </div>
  );
}
