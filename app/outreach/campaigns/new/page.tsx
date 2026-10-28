import Link from "next/link";
import { db } from "@/db/client";
import { mailboxes } from "@/db/schema";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageShell, PageHeader } from "@/components/outreach/PageShell";
import { NewCampaignForm } from "./NewCampaignForm";

export const metadata = { title: "New campaign | LeadFlow" };

// See app/outreach/mailboxes/page.tsx for why this is required.
export const dynamic = "force-dynamic";

export default async function NewCampaignPage() {
  const rows = await db
    .select({ id: mailboxes.id, fromName: mailboxes.fromName, fromEmail: mailboxes.fromEmail })
    .from(mailboxes);

  return (
    <PageShell>
      <PageHeader
        back={{ href: "/outreach", label: "All campaigns" }}
        title="New campaign"
        description="Nothing sends when you save — the campaign starts as a draft and only begins after it passes preflight."
      />

      {rows.length === 0 ? (
        <EmptyState
          title="Connect a mailbox first"
          description="A campaign needs at least one mailbox in its sending pool before it can be created."
        >
          <Link
            href="/outreach/mailboxes"
            className="mt-2 inline-flex min-h-11 items-center rounded-md bg-signal px-4 text-sm font-medium text-white shadow-raised transition-[background-color,transform] duration-200 ease-out hover:bg-signal-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:scale-[0.96]"
          >
            Go to mailboxes
          </Link>
        </EmptyState>
      ) : (
        <NewCampaignForm mailboxes={rows} />
      )}
    </PageShell>
  );
}
