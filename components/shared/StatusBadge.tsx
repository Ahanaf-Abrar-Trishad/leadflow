import { cn } from "@/lib/cn";

export type StatusTone = "win" | "live" | "neutral" | "attention" | "fault";

/*
 * Every status string this product renders, mapped to one of five tones.
 *
 * `replied` is deliberately the only "win" tone. It is the single outcome the
 * whole sequencer exists to produce, and the one an operator scans a list of
 * 500 rows looking for - so it is the only status drawn filled, and it wins
 * against everything else on the page including the primary button. Treating
 * it as just another green pill next to `active` and `healthy` is what made
 * the old all-grey tables unreadable in the first place.
 */
const TONE_BY_STATUS: Record<string, StatusTone> = {
  replied: "win",

  active: "live",
  healthy: "live",
  sent: "live",
  completed: "live",

  draft: "neutral",
  pending: "neutral",

  paused: "attention",
  warming: "attention",

  bounced: "fault",
  failed: "fault",
  unsubscribed: "fault",
  suppressed: "fault",
};

const TONE_CLASSES: Record<StatusTone, string> = {
  win: "border-transparent bg-signal text-white shadow-raised",
  live: "border-signal/25 bg-signal-soft text-signal-strong",
  neutral: "border-border bg-paper text-ink-muted",
  attention: "border-flag/25 bg-flag-soft text-flag",
  fault: "border-danger/25 bg-danger-soft text-danger",
};

const DOT_CLASSES: Record<StatusTone, string> = {
  win: "bg-white",
  live: "bg-signal",
  neutral: "bg-ink-faint",
  attention: "bg-flag",
  fault: "bg-danger",
};

export interface StatusBadgeProps {
  status: string;
  /** Overrides the status map - for values it doesn't know about. */
  tone?: StatusTone;
  className?: string;
}

export function StatusBadge({ status, tone, className }: StatusBadgeProps) {
  const resolved = tone ?? TONE_BY_STATUS[status] ?? "neutral";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border px-2.5 py-0.5",
        // Mono at small sizes keeps a column of these the same width apart
        // from the label itself, so the left edges line up down a table.
        "font-mono text-[0.6875rem] font-medium uppercase tracking-wide",
        TONE_CLASSES[resolved],
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn("h-1.5 w-1.5 flex-none rounded-full", DOT_CLASSES[resolved])}
      />
      {status.replace(/_/g, " ")}
    </span>
  );
}
