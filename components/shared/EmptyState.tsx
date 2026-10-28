import type { ReactNode } from "react";
import { BracketsIcon } from "@/components/shared/icons";
import { cn } from "@/lib/cn";

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  /** The way out of the empty state - usually the one action that fills it. */
  children?: ReactNode;
  className?: string;
}

/** Empty brackets - the suite's own mark, standing in for the slot with nothing in it yet. */
const DEFAULT_ICON = (
  <span className="mb-1 flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface text-ink-faint shadow-raised">
    <BracketsIcon className="h-5 w-5" />
  </span>
);

export function EmptyState({
  title,
  description,
  icon = DEFAULT_ICON,
  children,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border-strong px-6 py-12 text-center",
        className,
      )}
    >
      {icon}
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && (
        <p className="max-w-sm text-sm text-ink-muted">{description}</p>
      )}
      {children}
    </div>
  );
}
