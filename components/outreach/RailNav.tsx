"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import type { SessionUser } from "@/lib/outreach/auth/session";
import type { HeartbeatStatus } from "@/lib/outreach/dashboard/queries";
import { SignOutButton } from "@/app/outreach/SignOutButton";

interface Section {
  href: string;
  label: string;
  badge?: string | number;
}

type NavCounts = {
  campaigns?: number;
  mailboxes?: number;
  unreadReplies?: number;
  pendingDrafts?: number;
};

function buildSections(counts: NavCounts): Section[] {
  return [
    { href: "/outreach/dashboard", label: "Dashboard" },
    { href: "/outreach/leads", label: "Leads" },
    {
      href: "/outreach/approvals",
      label: "Approvals",
      badge: counts.pendingDrafts ? counts.pendingDrafts : undefined,
    },
    {
      href: "/outreach/replies",
      label: "Replies",
      badge: counts.unreadReplies ? counts.unreadReplies : undefined,
    },
    { href: "/outreach/pipeline", label: "Pipeline" },
    { href: "/outreach/proposals", label: "Proposals" },
    { href: "/outreach/clients", label: "Clients" },
    { href: "/outreach", label: "Campaigns", badge: counts.campaigns },
    {
      href: "/outreach/mailboxes",
      label: "Mailboxes",
      badge: counts.mailboxes,
    },
    { href: "/outreach/suppressions", label: "Suppressions" },
    { href: "/outreach/events", label: "Events" },
  ];
}

const ADMIN_LINKS = [
  { href: "/outreach/settings/claude", label: "Connect Claude" },
  { href: "/outreach/settings/users", label: "Users" },
];

function formatAge(secondsAgo: number | null): string {
  if (secondsAgo === null) return "never";
  if (secondsAgo < 60) return `${secondsAgo}s`;
  return `${Math.round(secondsAgo / 60)}m`;
}

export interface RailNavProps {
  user: SessionUser;
  heartbeats: { worker: HeartbeatStatus; poller: HeartbeatStatus };
  counts?: NavCounts;
}

function Brand() {
  return (
    <div className="flex items-center gap-2">
      <span className="relative h-3.5 w-3.5 flex-none border-[1.5px] border-signal">
        <span className="absolute inset-[3px] bg-signal" />
      </span>
      <span className="font-display text-[17px] font-semibold tracking-wide text-ink">
        LEADFLOW
      </span>
    </div>
  );
}

/*
 * The console's primary navigation — a persistent left rail rather than the
 * previous top bar, matching the "Industry" blueprint design. It is the
 * app's only navigation.
 *
 * Below the lg breakpoint the rail would eat a phone's width, so it becomes
 * a drawer instead: a slim top bar with a Menu button slides the same rail in
 * over the page. It closes on navigation, on Escape and on a tap outside.
 */
export function RailNav({ user, heartbeats, counts = {} }: RailNavProps) {
  const pathname = usePathname();
  const sections = buildSections(counts);
  const [open, setOpen] = useState(false);
  // Total of everything waiting on the operator, so a closed drawer on a
  // phone still says there is something to look at.
  const waiting = (counts.unreadReplies ?? 0) + (counts.pendingDrafts ?? 0);

  // A link inside the drawer changes the path: close it behind the navigation.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    // Keep the page behind the drawer from scrolling under a finger.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-surface px-4 py-2.5 lg:hidden">
        <Brand />
        <button
          type="button"
          aria-expanded={open}
          aria-controls="console-nav"
          onClick={() => setOpen(true)}
          className="flex min-h-11 items-center gap-2 border border-border-strong px-3 text-sm font-medium text-ink"
        >
          Menu
          {waiting > 0 && (
            <span
              className="min-w-5 bg-signal px-1.5 text-center text-[11px] text-white"
              aria-label={`${waiting} waiting`}
            >
              {waiting}
            </span>
          )}
        </button>
      </header>

      {open && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-40 bg-ink/40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        id="console-nav"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-dvh w-[260px] max-w-[85vw] flex-none flex-col overflow-y-auto border-r border-border bg-surface",
          "transition-transform duration-200 ease-out motion-reduce:transition-none",
          open ? "translate-x-0 shadow-float" : "-translate-x-full",
          "lg:sticky lg:top-0 lg:z-auto lg:w-[212px] lg:max-w-none lg:translate-x-0 lg:shadow-none",
        )}
      >
        <div className="flex items-start justify-between border-b border-border px-4 py-4">
          <div>
            <Brand />
            <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
              Lead pipeline console
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="-mr-1 -mt-1 min-h-11 min-w-11 text-sm text-ink-muted lg:hidden"
          >
            Close
          </button>
        </div>

        <nav
          aria-label="Outreach sections"
          className="flex flex-col gap-px p-2.5"
        >
          {sections.map((section) => {
            const isActive =
              section.href === "/outreach"
                ? pathname === "/outreach" ||
                  pathname.startsWith("/outreach/campaigns")
                : pathname === section.href ||
                  pathname.startsWith(`${section.href}/`);

            return (
              <Link
                key={section.href}
                href={section.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 border-l-2 px-2.5 py-1.5 text-[13.5px] tracking-[0.01em]",
                  "transition-colors duration-200 ease-out",
                  isActive
                    ? "border-signal bg-signal-soft text-signal-strong"
                    : "border-transparent text-ink-muted hover:bg-paper hover:text-ink",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-1.5 w-1.5 flex-none rotate-45",
                    isActive ? "bg-signal" : "bg-ink-faint",
                  )}
                />
                <span className="flex-1">{section.label}</span>
                {section.badge !== undefined && section.badge !== "" && (
                  <span className="text-[11px] text-ink-faint">
                    {section.badge}
                  </span>
                )}
              </Link>
            );
          })}
          {user.role === "admin" &&
            ADMIN_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={pathname === link.href ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 border-l-2 px-2.5 py-1.5 text-[13.5px] tracking-[0.01em]",
                  "transition-colors duration-200 ease-out",
                  pathname === link.href
                    ? "border-signal bg-signal-soft text-signal-strong"
                    : "border-transparent text-ink-muted hover:bg-paper hover:text-ink",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-1.5 w-1.5 flex-none rotate-45",
                    pathname === link.href ? "bg-signal" : "bg-ink-faint",
                  )}
                />
                <span className="flex-1">{link.label}</span>
              </Link>
            ))}
        </nav>

        <div className="mt-auto border-t border-border p-3">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
            Process
          </div>
          {[heartbeats.worker, heartbeats.poller].map((status) => (
            <div
              key={status.process}
              className="flex items-center gap-2 py-0.5 text-xs"
            >
              <span
                className={cn(
                  "tick h-1.5 w-1.5 flex-none rounded-full",
                  status.healthy ? "bg-signal" : "bg-danger",
                )}
              />
              <span className="flex-1 capitalize text-ink">
                {status.process}
              </span>
              <span className="text-ink-faint">
                {formatAge(status.secondsAgo)}
              </span>
            </div>
          ))}
          <div className="mt-3 flex flex-col gap-2 border-t border-border pt-2.5">
            <span
              className="overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-ink-faint"
              title={user.email}
            >
              {user.email}
            </span>
            <SignOutButton />
          </div>
        </div>
      </aside>
    </>
  );
}
