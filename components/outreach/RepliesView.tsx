"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/shared/Button";
import { cn } from "@/lib/cn";
import { useUIStore } from "@/store/uiStore";
import { threadNeedsAttention, type ReplyThread, type ThreadMessage } from "@/lib/outreach/replies/types";

type FilterKey = "unhandled" | "all";

function formatTime(value: Date): string {
  return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function RepliesView({
  threads,
  selectedEnrollmentId,
  selectedThread,
  threadMessages,
}: {
  threads: ReplyThread[];
  selectedEnrollmentId: string | null;
  selectedThread: ReplyThread | null;
  threadMessages: ThreadMessage[];
}) {
  const [filter, setFilter] = useState<FilterKey>("unhandled");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const showToast = useUIStore((state) => state.showToast);

  const unhandledCount = useMemo(() => threads.filter((t) => threadNeedsAttention(t)).length, [threads]);
  const visible = useMemo(
    () => (filter === "unhandled" ? threads.filter((t) => threadNeedsAttention(t)) : threads),
    [threads, filter],
  );

  const openThread = (enrollmentId: string) => {
    router.push(`/outreach/replies?thread=${enrollmentId}`);
  };

  const runAction = async (action: "handle" | "snooze" | "unsubscribe", successMessage: string) => {
    if (!selectedEnrollmentId) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/outreach/replies/${selectedEnrollmentId}/${action}`, { method: "POST" });
      if (!response.ok) {
        showToast("error", `Could not ${action} this thread.`);
        return;
      }
      showToast("success", successMessage);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const sendReply = async () => {
    if (!selectedEnrollmentId || !draft.trim()) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/outreach/replies/${selectedEnrollmentId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: draft.trim() }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        showToast("error", body?.error ?? "Could not send the reply.");
        return;
      }
      setDraft("");
      showToast("success", "Reply sent.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4.5 lg:grid-cols-[344px_minmax(0,1fr)] lg:items-start">
      <div className="flex flex-col gap-3">
        <div className="flex border border-border">
          {(
            [
              { key: "unhandled" as const, label: "Unhandled", count: unhandledCount },
              { key: "all" as const, label: "All", count: threads.length },
            ]
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilter(tab.key)}
              className={cn(
                "flex-1 border-r border-border py-1.5 font-display text-[12.5px] font-semibold uppercase tracking-[0.05em] last:border-r-0",
                filter === tab.key ? "bg-signal-soft text-signal-strong" : "text-ink-muted hover:bg-paper",
              )}
            >
              {tab.label} <span className="font-sans font-normal opacity-60">{tab.count}</span>
            </button>
          ))}
        </div>

        <div className="blueprint">
          <i className="corner tl" aria-hidden="true" />
          <i className="corner tr" aria-hidden="true" />
          <i className="corner bl" aria-hidden="true" />
          <i className="corner br" aria-hidden="true" />
          {visible.length === 0 ? (
            <div className="px-4 py-6 text-sm text-ink-muted">Nothing here. Every reply in this filter has been handled.</div>
          ) : (
            visible.map((thread) => {
              const needsAttention = threadNeedsAttention(thread);
              const isSelected = thread.enrollmentId === selectedEnrollmentId;
              return (
                <button
                  key={thread.enrollmentId}
                  type="button"
                  onClick={() => openThread(thread.enrollmentId)}
                  className={cn(
                    "block w-full border-b border-border px-3.5 py-2.5 text-left last:border-0 hover:bg-ink/[0.03]",
                    isSelected && "bg-signal-soft",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className={cn("h-1.5 w-1.5 flex-none rounded-full", needsAttention ? "bg-signal" : "border border-ink-faint")} />
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{thread.contactEmail}</span>
                    <span className="flex-none text-[11px] text-ink-faint">{formatTime(thread.createdAt)}</span>
                  </div>
                  <div className="mt-0.5 truncate text-[11.5px] text-ink-muted">{thread.campaignName}</div>
                  <div className="mt-1.5 line-clamp-2 text-[12.5px] text-ink-muted">{thread.snippet}</div>
                  {thread.unsubscribeRequested && (
                    <span className="mt-1.5 inline-block bg-danger-soft px-1.5 py-px text-[10px] uppercase tracking-[0.09em] text-danger">
                      Unsubscribe
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className="blueprint">
        <i className="corner tl" aria-hidden="true" />
        <i className="corner tr" aria-hidden="true" />
        <i className="corner bl" aria-hidden="true" />
        <i className="corner br" aria-hidden="true" />
        {!selectedThread ? (
          <div className="p-6">
            <EmptyState title="Select a thread" description="Pick a contact on the left to read the conversation." />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-start gap-3.5 border-b border-border px-4.5 py-3.5">
              <div className="min-w-0 flex-1 basis-[220px]">
                <div className="font-display text-xl font-semibold">{selectedThread.contactEmail}</div>
                <div className="mt-0.5 text-[12.5px] text-ink-muted">
                  {selectedThread.campaignName} · Step {selectedThread.currentStep} · {selectedThread.status}
                </div>
              </div>
              <div className="flex flex-none flex-wrap gap-1.5">
                <Button variant="secondary" disabled={busy} onClick={() => runAction("snooze", "Snoozed for 3 days.")}>
                  Snooze 3d
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => runAction("handle", "Marked handled.")}>
                  Mark handled
                </Button>
                <Button variant="danger" disabled={busy} onClick={() => runAction("unsubscribe", "Unsubscribed.")}>
                  Unsubscribe
                </Button>
              </div>
            </div>

            <div className="flex max-h-[420px] flex-col gap-3 overflow-y-auto p-4.5">
              {threadMessages.map((m) => (
                <div key={m.id} className={cn("flex flex-col", m.direction === "out" ? "items-end" : "items-start")}>
                  <div className="max-w-[78%] border border-border bg-paper px-3.5 py-2.5">
                    <div className="mb-1 flex items-baseline gap-2.5">
                      <span className="text-[11px] font-bold uppercase tracking-[0.09em]">
                        {m.direction === "out" ? "You" : selectedThread.contactEmail}
                      </span>
                      <span className="text-[11px] text-ink-faint">{formatTime(m.at)}</span>
                    </div>
                    <div className="whitespace-pre-wrap text-[13px] text-ink-muted">{m.text}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-border p-4.5">
              <textarea
                rows={4}
                className="w-full resize-y border border-border-strong bg-surface px-3 py-2 text-[13.5px] text-ink outline-none placeholder:text-ink-faint focus-visible:border-signal"
                placeholder="Reply as the sending mailbox. This lands in the same thread the sequence created."
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-[11.5px] text-ink-faint">
                  Sending stops for this contact either way. Replying marks the thread handled.
                </span>
                <Button disabled={busy || !draft.trim()} onClick={sendReply}>
                  Send reply
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
