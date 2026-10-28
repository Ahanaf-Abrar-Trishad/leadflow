import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRightIcon } from "@/components/shared/icons";
import { cn } from "@/lib/cn";

/*
 * Two widths, not five. Every outreach page used to set its own container and
 * they drifted to max-w-2xl/3xl/4xl/5xl, so the content column visibly jumped
 * as you moved between pages of the same product. `prose` is for forms and
 * detail views, `wide` for anything with a table in it.
 */
const WIDTHS = {
  prose: "max-w-3xl",
  wide: "max-w-6xl",
} as const;

export interface PageShellProps {
  width?: keyof typeof WIDTHS;
  children: ReactNode;
}

export function PageShell({ width = "prose", children }: PageShellProps) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className={cn("mx-auto px-4 pb-20 pt-10 outline-none sm:px-6", WIDTHS[width])}
    >
      {children}
    </main>
  );
}

export interface PageHeaderProps {
  title: string;
  /** Sits above the title - a status badge, a parent campaign name. */
  eyebrow?: ReactNode;
  description?: string;
  /** Buttons and links aligned opposite the title. */
  actions?: ReactNode;
  /** Every page below the top level needs a way out that isn't the browser. */
  back?: { href: string; label: string };
}

export function PageHeader({ title, eyebrow, description, actions, back }: PageHeaderProps) {
  return (
    // `ambient-wash` puts a single feathered radial of the accent behind the
    // heading. A page that opens on type against a flat fill is what reads as
    // unfinished - see app/globals.css for why it's a tint rather than a band.
    <header className="ambient-wash mb-8">
      {back && (
        <Link
          href={back.href}
          className="group mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors duration-200 ease-out hover:text-ink"
        >
          <ArrowRightIcon className="h-3.5 w-3.5 rotate-180 transition-transform duration-200 ease-out group-hover:-translate-x-0.5" />
          {back.label}
        </Link>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <div className="mb-2.5 flex items-center gap-2">{eyebrow}</div>}
          {/* Tight tracking at display size - Manrope's default spacing is
              tuned for text, and stays too open when scaled up this far. */}
          <h1 className="font-display text-3xl font-bold tracking-[-0.02em] text-ink sm:text-4xl">
            {title}
          </h1>
          {description && <p className="mt-2 max-w-prose text-sm text-ink-muted">{description}</p>}
        </div>

        {actions && <div className="flex flex-none flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
