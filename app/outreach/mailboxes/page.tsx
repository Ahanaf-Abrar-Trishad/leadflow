import { db } from "@/db/client";
import { mailboxes } from "@/db/schema";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PageShell, PageHeader } from "@/components/outreach/PageShell";
import { BlueprintCard } from "@/components/outreach/BlueprintCard";
import { MailboxForm } from "./MailboxForm";
import { ResumeMailboxButton } from "./ResumeMailboxButton";
import { EditMailboxButton } from "./EditMailboxButton";
import { DisconnectMailboxButton } from "./DisconnectMailboxButton";

export const metadata = { title: "Mailboxes | LeadFlow" };

// Reads live DB state via a raw Postgres client, which Next's static
// analysis can't see (it only recognizes `fetch()` and request-time APIs as
// dynamic signals). Without this, the mailbox list gets baked in at build
// time and never updates. See caching-without-cache-components.md.
export const dynamic = "force-dynamic";

export default async function MailboxesPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; googleError?: string }>;
}) {
  const { connected, googleError } = await searchParams;

  const rows = await db
    .select({
      id: mailboxes.id,
      provider: mailboxes.provider,
      fromName: mailboxes.fromName,
      fromEmail: mailboxes.fromEmail,
      dailyCap: mailboxes.dailyCap,
      health: mailboxes.health,
    })
    .from(mailboxes);

  return (
    <PageShell>
      <PageHeader
        title="Mailboxes"
        description="Every account the sequencer sends through. Volume ramps automatically from 15/day on a newly connected mailbox."
      />

      {connected && (
        <p className="mb-6 rounded-md border border-signal/30 bg-signal-soft px-4 py-3 text-sm text-signal-strong">
          Mailbox connected via Google.
        </p>
      )}
      {googleError && (
        <p role="alert" className="mb-6 rounded-md border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
          {googleError}
        </p>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title="No mailboxes connected"
          description="Connect one below. Campaigns can't start until at least one healthy mailbox exists."
        />
      ) : (
        <ul className="animate-stagger flex flex-col gap-2">
          {rows.map((mailbox, index) => (
            <li
              key={mailbox.id}
              style={{ "--index": index } as React.CSSProperties}
              className="blueprint flex flex-wrap items-center justify-between gap-4 p-4"
            >
              <i className="corner tl" aria-hidden="true" />
              <i className="corner tr" aria-hidden="true" />
              <i className="corner bl" aria-hidden="true" />
              <i className="corner br" aria-hidden="true" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink">{mailbox.fromName}</span>
                  <StatusBadge status={mailbox.health} />
                </div>
                {/* Gmail-connected mailboxes default their display name to the
                    address, and printing it twice reads as a bug. */}
                {mailbox.fromName !== mailbox.fromEmail && (
                  <p className="mt-0.5 text-sm text-ink-muted">{mailbox.fromEmail}</p>
                )}
                <p data-numeric className="mt-1 font-mono text-xs text-ink-faint">
                  {mailbox.provider === "gmail_oauth" ? "Google" : "SMTP"} · {mailbox.dailyCap}/day
                </p>
              </div>
              <div className="flex flex-none flex-wrap gap-2">
                {mailbox.health === "paused" && <ResumeMailboxButton mailboxId={mailbox.id} />}
                <EditMailboxButton
                  mailboxId={mailbox.id}
                  fromName={mailbox.fromName}
                  dailyCap={mailbox.dailyCap}
                />
                <DisconnectMailboxButton mailboxId={mailbox.id} fromEmail={mailbox.fromEmail} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <BlueprintCard className="mt-10">
        <h2 className="font-display text-lg font-semibold text-ink">Connect a mailbox</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Google is the better option where it&apos;s available — threading and reply detection go
          through the Gmail API rather than IMAP polling.
        </p>

        {/* Deliberately a plain <a>, not next/link's <Link> - this route
            sets a CSRF state cookie and issues a redirect to Google as a
            real side effect. <Link>'s default viewport/hover prefetch
            would trigger that side effect just from this button being
            on screen. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/api/outreach/mailboxes/google/start"
          className="mt-4 inline-flex min-h-11 items-center rounded-md border border-border-strong bg-surface px-4 text-sm font-medium text-ink shadow-raised transition-[background-color,border-color,transform] duration-200 ease-out hover:bg-paper hover:border-ink-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:scale-[0.96]"
        >
          Connect with Google
        </a>

        <details className="group mt-6 border-t border-border pt-5">
          <summary className="cursor-pointer list-none text-sm font-medium text-ink-muted transition-colors duration-200 ease-out hover:text-ink">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="transition-transform duration-200 ease-out group-open:rotate-90">
                ›
              </span>
              Or connect via SMTP/IMAP
            </span>
          </summary>
          <div className="mt-4">
            <MailboxForm />
          </div>
        </details>
      </BlueprintCard>
    </PageShell>
  );
}
