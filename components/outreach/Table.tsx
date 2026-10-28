import type { ThHTMLAttributes, TdHTMLAttributes, TableHTMLAttributes, HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/*
 * Shared table primitives — every outreach table (dashboard, campaigns,
 * mailboxes, enrollments, events) previously hand-rolled its own TH/TD class
 * strings. Extracted here since the blueprint redesign touches all of them
 * anyway.
 */

export function Table(props: TableHTMLAttributes<HTMLTableElement>) {
  return <table {...props} className={cn("w-full border-collapse text-left text-[13.5px]", props.className)} />;
}

export function Th({ className, align = "left", ...props }: ThHTMLAttributes<HTMLTableCellElement> & { align?: "left" | "right" }) {
  return (
    <th
      {...props}
      className={cn(
        "border-b border-border px-3 py-2.5 font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
    />
  );
}

export function Td({ className, align = "left", numeric, ...props }: TdHTMLAttributes<HTMLTableCellElement> & { align?: "left" | "right"; numeric?: boolean }) {
  return (
    <td
      {...props}
      data-numeric={numeric || undefined}
      className={cn("px-3 py-2.5", align === "right" ? "text-right" : "text-left", className)}
    />
  );
}

export function Tr({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr {...props} className={cn("border-b border-border last:border-0 hover:bg-ink/[0.03]", className)} />;
}
