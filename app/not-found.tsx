import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { NotFoundActions } from "./NotFoundActions";

export const metadata: Metadata = {
  title: "Page Not Found | LeadFlow",
  description: "The page you're looking for doesn't exist or has moved.",
};

export default function NotFound() {
  return (
    // `dvh`, not `vh`: on iOS Safari `vh` is measured against the *expanded*
    // viewport, so a `60vh` centred block jumps as the URL bar collapses.
    <main
      id="main-content"
      tabIndex={-1}
      className="relative flex min-h-[60dvh] flex-col items-center justify-center overflow-hidden px-4 py-16 text-center outline-none sm:px-6"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex select-none items-center justify-center text-[16rem] font-bold tracking-tight text-transparent [-webkit-text-stroke:2px_var(--color-border-strong)] sm:text-[22rem]"
      >
        404
      </span>

      <div className="animate-stagger relative z-10 flex max-w-md flex-col items-center gap-8">
        <div className="space-y-2">
          <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            Page not found
          </h1>
          <p className="text-lg text-ink-muted">
            The page you&apos;re looking for doesn&apos;t exist or has moved.
          </p>
        </div>

        <div style={{ "--index": 1 } as CSSProperties}>
          <NotFoundActions />
        </div>
      </div>
    </main>
  );
}
