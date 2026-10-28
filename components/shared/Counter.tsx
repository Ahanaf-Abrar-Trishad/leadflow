import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type CounterState = "neutral" | "warning" | "error";

export interface CounterProps {
  state?: CounterState;
  children: ReactNode;
  className?: string;
}

const STATE_CLASSES: Record<CounterState, string> = {
  neutral: "text-ink-muted",
  warning: "text-flag",
  error: "text-danger",
};

/**
 * Live count text (line counts, predicted-merge counts, etc). Color alone
 * never carries the warning/error meaning - callers pass real message text,
 * and the error state is additionally announced via role="alert" per TRD §10.
 */
export function Counter({
  state = "neutral",
  children,
  className,
}: CounterProps) {
  return (
    // `tabular-nums` on top of the mono face: JetBrains Mono is already
    // fixed-width, but the counter falls back to the system mono stack while
    // the webfont loads and those are not all tabular.
    <p
      role={state === "error" ? "alert" : undefined}
      className={cn(
        "font-mono text-sm tabular-nums",
        STATE_CLASSES[state],
        className,
      )}
    >
      {children}
    </p>
  );
}
