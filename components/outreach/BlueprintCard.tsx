import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface BlueprintCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Card content manages its own padding (e.g. a table that needs to bleed
   * to the card's edges) rather than the card's default padding. */
  noPadding?: boolean;
}

/*
 * The blueprint frame: a square, transparent, hairline-bordered panel with
 * registration tick-marks at each corner (see .blueprint/.corner in
 * outreach-theme.css). This is the one recurring card treatment across every
 * screen in the redesign — stat tiles, list panels, table wrappers.
 */
export function BlueprintCard({ children, noPadding, className, ...props }: BlueprintCardProps) {
  return (
    <div className={cn("blueprint", !noPadding && "p-4", className)} {...props}>
      <i className="corner tl" aria-hidden="true" />
      <i className="corner tr" aria-hidden="true" />
      <i className="corner bl" aria-hidden="true" />
      <i className="corner br" aria-hidden="true" />
      {children}
    </div>
  );
}
