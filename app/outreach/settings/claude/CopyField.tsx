"use client";

import { useState } from "react";
import { useUIStore } from "@/store/uiStore";

/** A read-only value with a copy button. `secret` hides it until revealed,
 * so the connector token is not shown to anyone glancing at the screen. */
export function CopyField({
  value,
  label,
  secret = false,
  multiline = false,
}: {
  value: string;
  label: string;
  secret?: boolean;
  multiline?: boolean;
}) {
  const [revealed, setRevealed] = useState(!secret);
  const showToast = useUIStore((state) => state.showToast);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      showToast("success", `${label} copied.`);
    } catch {
      showToast("error", "Could not copy. Select the text and copy it by hand.");
    }
  };

  const shown = revealed ? value : value.replace(/[^/]{12,}$/, (tail) => "•".repeat(Math.min(tail.length, 24)));

  return (
    <div className="flex items-start gap-2">
      {multiline ? (
        <p aria-label={label} className="min-w-0 flex-1 rounded-md border border-border bg-paper p-2 text-sm text-ink">
          {shown}
        </p>
      ) : (
        <code aria-label={label} className="min-w-0 flex-1 break-all rounded-md border border-border bg-paper p-2 font-mono text-xs text-ink [font-variant-ligatures:none]">
          {shown}
        </code>
      )}
      {secret && (
        <button
          type="button"
          onClick={() => setRevealed((value) => !value)}
          className="min-h-9 rounded-md border border-border-strong bg-surface px-3 text-sm text-ink hover:bg-paper"
        >
          {revealed ? "Hide" : "Show"}
        </button>
      )}
      <button
        type="button"
        onClick={copy}
        className="min-h-9 rounded-md border border-border-strong bg-surface px-3 text-sm text-ink hover:bg-paper"
      >
        Copy
      </button>
    </div>
  );
}
