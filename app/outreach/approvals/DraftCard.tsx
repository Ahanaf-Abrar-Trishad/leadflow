"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/shared/Button";
import { BlueprintCard } from "@/components/outreach/BlueprintCard";
import { cn } from "@/lib/cn";
import { useUIStore } from "@/store/uiStore";

const MAX_LENGTH = 400;

export interface DraftCardData {
  id: string;
  content: string;
  observations: string;
  leadName: string;
  leadCategory: string | null;
  leadWebsite: string | null;
  leadEmail: string | null;
}

export function DraftCard({ draft }: { draft: DraftCardData }) {
  const [text, setText] = useState(draft.content);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const router = useRouter();
  const showToast = useUIStore((state) => state.showToast);

  const trimmedLength = text.trim().length;
  const tooLong = trimmedLength > MAX_LENGTH;
  const tooShort = trimmedLength < 20;

  const act = async (action: "approve" | "reject") => {
    setBusy(action);
    try {
      const response = await fetch(`/api/outreach/drafts/${draft.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "approve" && text !== draft.content ? { content: text } : {}),
      });
      const body = await response.json();
      if (!response.ok) {
        showToast("error", typeof body.error === "string" ? body.error : `Could not ${action} this draft.`);
        return;
      }
      showToast("success", action === "approve" ? `Approved the icebreaker for ${draft.leadName}.` : "Draft rejected.");
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  const textareaId = `draft-${draft.id}`;

  return (
    <BlueprintCard>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-ink">{draft.leadName}</p>
          <p className="truncate text-xs text-ink-faint">
            {[draft.leadCategory, draft.leadEmail].filter(Boolean).join(" · ")}
          </p>
        </div>
        {draft.leadWebsite && (
          <a
            href={draft.leadWebsite}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-sm text-signal-strong hover:underline"
          >
            Open website
          </a>
        )}
      </div>

      <label htmlFor={textareaId} className="mb-1 block text-sm font-medium text-ink">
        Icebreaker
      </label>
      <textarea
        id={textareaId}
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={3}
        aria-describedby={`${textareaId}-count`}
        className={cn(
          "w-full rounded-md border bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal",
          tooLong || tooShort ? "border-danger" : "border-border-strong",
        )}
      />
      <p id={`${textareaId}-count`} className={cn("mt-1 text-xs", tooLong ? "text-danger" : "text-ink-faint")}>
        {trimmedLength}/{MAX_LENGTH} characters{text !== draft.content ? " · edited" : ""}
      </p>

      {draft.observations && (
        <div className="mt-3 rounded-md bg-paper p-3">
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">Based on</p>
          <p className="whitespace-pre-line text-sm text-ink-muted">{draft.observations}</p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button loading={busy === "approve"} disabled={busy !== null || tooLong || tooShort} onClick={() => act("approve")}>
          {text !== draft.content ? "Approve edited" : "Approve"}
        </Button>
        <Button variant="secondary" loading={busy === "reject"} disabled={busy !== null} onClick={() => act("reject")}>
          Reject
        </Button>
        {text !== draft.content && (
          <button type="button" onClick={() => setText(draft.content)} className="px-2 text-sm text-ink-muted hover:text-ink">
            Undo edits
          </button>
        )}
      </div>
    </BlueprintCard>
  );
}
