"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/shared/Button";
import { cn } from "@/lib/cn";
import { useUIStore } from "@/store/uiStore";
import { threadNeedsAttention, type ReplyThread, type ThreadMessage } from "@/lib/outreach/replies/types";
import { CATEGORY_LABELS, STAGE_LABELS, isDealStage, type ReplyCategory } from "@/lib/deals/stages";

type FilterKey = "unhandled" | "interested" | "all";

export interface ReplyDraft {
  id: string;
  content: string;
  observations: string;
}

const CATEGORY_CLASSES: Record<string, string> = {
  interested: "bg-signal text-white",
  question: "bg-signal-soft text-signal-strong",
  not_now: "bg-flag-soft text-flag",
  unsubscribe: "bg-danger-soft text-danger",
};

function CategoryBadge({ category }: { category: string }) {
  return (
    <span
      className={cn(
        "inline-block px-1.5 py-px text-[10px] uppercase tracking-[0.09em]",
        CATEGORY_CLASSES[category] ?? "bg-paper text-ink-muted",
      )}
    >
      {CATEGORY_LABELS[category as ReplyCategory] ?? category}
    </span>
  );
}

function formatTime(value: Date): string {
  return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function RepliesView({
  threads,
  selectedEnrollmentId,
  selectedThread,
  threadMessages,
  replyDraft,
  deal,
}: {
  threads: ReplyThread[];
  selectedEnrollmentId: string | null;
  selectedThread: ReplyThread | null;
  threadMessages: ThreadMessage[];
  replyDraft: ReplyDraft | null;
  deal: { id: string; stage: string } | null;
}) {
  const [filter, setFilter] = useState<FilterKey>("unhandled");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const showToast = useUIStore((state) => state.showToast);

  const unhandledCount = useMemo(() => threads.filter((t) => threadNeedsAttention(t)).length, [threads]);
  const interestedCount = useMemo(() => threads.filter((t) => t.classification === "interested").length, [threads]);
  const visible = useMemo(
    () =>
      filter === "unhandled"
        ? threads.filter((t) => threadNeedsAttention(t))
        : filter === "interested"
          ? threads.filter((t) => t.classification === "interested")
          : threads,
    [threads, filter],
  );

  const openThread = (enrollmentId: string) => {
    router.push(`/outreach/replies?thread=${enrollmentId}`);
  };

  const runAction = async (
    action: "handle" | "snooze" | "unsubscribe" | "pipeline" | "discard-draft",
    successMessage: string,
  ) => {
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

  return (
    <div className="grid grid-cols-1 gap-4.5 lg:grid-cols-[344px_minmax(0,1fr)] lg:items-start">
      {/* On a phone the list and the open thread can't sit side by side, and
          a thread opened below a long list is easy to miss: show one at a
          time there, with a way back to the list. */}
      <div className={cn("flex flex-col gap-3", selectedThread && "hidden lg:flex")}>
        <div className="flex border border-border">
          {(
            [
              { key: "unhandled" as const, label: "Unhandled", count: unhandledCount },
              { key: "interested" as const, label: "Interested", count: interestedCount },
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
                  {(thread.classification || thread.unsubscribeRequested) && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {thread.classification && <CategoryBadge category={thread.classification} />}
                      {thread.unsubscribeRequested && thread.classification !== "unsubscribe" && (
                        <CategoryBadge category="unsubscribe" />
                      )}
                    </div>
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
              <Link href="/outreach/replies" className="w-full text-sm text-ink-muted hover:text-ink lg:hidden">
                ← All replies
              </Link>
              <div className="min-w-0 flex-1 basis-[220px]">
                <div className="break-all font-display text-xl font-semibold">{selectedThread.contactEmail}</div>
                <div className="mt-0.5 text-[12.5px] text-ink-muted">
                  {selectedThread.campaignName} · Step {selectedThread.currentStep} · {selectedThread.status}
                </div>
                {deal && (
                  <Link href="/outreach/pipeline" className="mt-1 inline-block text-[12.5px] text-signal-strong hover:underline">
                    In pipeline: {isDealStage(deal.stage) ? STAGE_LABELS[deal.stage] : deal.stage}
                  </Link>
                )}
              </div>
              <div className="flex flex-none flex-wrap gap-1.5">
                {!deal && (
                  <Button variant="secondary" disabled={busy} onClick={() => runAction("pipeline", "Added to the pipeline.")}>
                    Add to pipeline
                  </Button>
                )}
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

            {selectedThread.classification && (
              <div className="flex flex-wrap items-center gap-2 border-b border-border bg-paper px-4.5 py-2.5 text-[12.5px] text-ink-muted">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">Claude</span>
                <CategoryBadge category={selectedThread.classification} />
                {selectedThread.classificationNote && <span>{selectedThread.classificationNote}</span>}
                {selectedThread.classification === "unsubscribe" && (
                  <span className="text-danger">If they asked to stop, use Unsubscribe.</span>
                )}
              </div>
            )}

            <div className="flex max-h-[420px] flex-col gap-3 overflow-y-auto p-4.5">
              {threadMessages.map((m) => (
                <div key={m.id} className={cn("flex flex-col", m.direction === "out" ? "items-end" : "items-start")}>
                  <div className="max-w-[92%] border border-border bg-paper px-3.5 py-2.5 sm:max-w-[78%]">
                    <div className="mb-1 flex flex-wrap items-baseline gap-x-2.5">
                      <span className="break-all text-[11px] font-bold uppercase tracking-[0.09em]">
                        {m.direction === "out" ? "You" : selectedThread.contactEmail}
                      </span>
                      <span className="text-[11px] text-ink-faint">{formatTime(m.at)}</span>
                    </div>
                    <div className="whitespace-pre-wrap text-[13px] text-ink-muted">{m.text}</div>
                  </div>
                </div>
              ))}
            </div>

            <ReplyComposer
              key={`${selectedThread.enrollmentId}:${replyDraft?.id ?? "none"}`}
              enrollmentId={selectedThread.enrollmentId}
              replyDraft={replyDraft}
              busy={busy}
              onDiscardDraft={() => runAction("discard-draft", "Draft discarded.")}
            />
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The reply box for one thread. Keyed by thread (and draft) in the parent,
 * so text typed for one contact can never carry over to another thread.
 * When Claude drafted an answer it starts pre-filled with it; sending is
 * still entirely the operator's action.
 */
function ReplyComposer({
  enrollmentId,
  replyDraft,
  busy: parentBusy,
  onDiscardDraft,
}: {
  enrollmentId: string;
  replyDraft: ReplyDraft | null;
  busy: boolean;
  onDiscardDraft: () => void;
}) {
  const [draft, setDraft] = useState(replyDraft?.content ?? "");
  const [sending, setSending] = useState(false);
  const router = useRouter();
  const showToast = useUIStore((state) => state.showToast);
  const busy = parentBusy || sending;

  const sendReply = async () => {
    if (!draft.trim()) return;
    setSending(true);
    try {
      const response = await fetch(`/api/outreach/replies/${enrollmentId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: draft.trim(), ...(replyDraft ? { draftId: replyDraft.id } : {}) }),
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
      setSending(false);
    }
  };

  return (
    <div className="border-t border-border p-4.5">
      {replyDraft && (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px] text-ink-muted">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-signal-strong">Drafted by Claude</span>
          <span>Read it and edit as needed. Nothing is sent until you press Send.</span>
          <button type="button" disabled={busy} onClick={onDiscardDraft} className="text-ink-faint underline disabled:opacity-50">
            Discard draft
          </button>
        </div>
      )}
      <textarea
        rows={replyDraft ? 7 : 4}
        aria-label="Reply"
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
  );
}
