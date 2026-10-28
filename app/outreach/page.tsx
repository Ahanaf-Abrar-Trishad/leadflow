import Link from "next/link";
import { PageShell, PageHeader } from "@/components/outreach/PageShell";
import { CampaignsTable } from "@/components/outreach/CampaignsTable";
import { getCampaignPerformanceRows } from "@/lib/outreach/dashboard/queries";

export const metadata = { title: "Outreach | LeadFlow" };

// See app/outreach/mailboxes/page.tsx for why this is required.
export const dynamic = "force-dynamic";

export default async function OutreachCampaignsPage() {
  // The dashboard's own query, reused rather than re-counting here: a campaign
  // list that shows only a name and a status is a list you have to click every
  // row of to learn anything from.
  const rows = await getCampaignPerformanceRows();

  return (
    <PageShell width="wide">
      <PageHeader
        title="Campaigns"
        description="Every sequence, and how it's performing. Reply rate counts only contacts that finished the sequence one way or another."
        actions={
          <Link
            href="/outreach/campaigns/new"
            className="inline-flex min-h-11 items-center rounded-md bg-signal px-4 text-sm font-medium text-white shadow-raised transition-[background-color,transform] duration-200 ease-out hover:bg-signal-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:scale-[0.96]"
          >
            New campaign
          </Link>
        }
      />

      <CampaignsTable rows={rows} />
    </PageShell>
  );
}
