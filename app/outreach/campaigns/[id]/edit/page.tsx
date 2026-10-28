import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { campaigns, campaignMailboxes, mailboxes, sequenceSteps } from "@/db/schema";
import { PageShell, PageHeader } from "@/components/outreach/PageShell";
import { EditCampaignForm } from "./EditCampaignForm";

export const dynamic = "force-dynamic";

export default async function EditCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id));
  if (!campaign || campaign.status !== "draft") notFound();

  const allMailboxes = await db
    .select({ id: mailboxes.id, fromName: mailboxes.fromName, fromEmail: mailboxes.fromEmail })
    .from(mailboxes);

  const pool = await db
    .select({ mailboxId: campaignMailboxes.mailboxId })
    .from(campaignMailboxes)
    .where(eq(campaignMailboxes.campaignId, id));

  const steps = await db
    .select({ subjectTemplate: sequenceSteps.subjectTemplate, bodyTemplate: sequenceSteps.bodyTemplate, delayDays: sequenceSteps.delayDays })
    .from(sequenceSteps)
    .where(eq(sequenceSteps.campaignId, id))
    .orderBy(asc(sequenceSteps.stepOrder));

  return (
    <PageShell>
      <PageHeader
        back={{ href: `/outreach/campaigns/${id}`, label: campaign.name }}
        title="Edit campaign"
        description="Editable while the campaign is still a draft. Once it starts, contacts are scheduled against these settings and they lock."
      />
      <EditCampaignForm
        mailboxes={allMailboxes}
        campaign={{
          id: campaign.id,
          name: campaign.name,
          postalAddress: campaign.postalAddress,
          businessDays: campaign.businessDays,
          businessHoursStart: campaign.businessHoursStart,
          businessHoursEnd: campaign.businessHoursEnd,
          baseIntervalSeconds: campaign.baseIntervalSeconds,
          domainThrottleLimit: campaign.domainThrottleLimit,
          poolMailboxIds: pool.map((p) => p.mailboxId),
          steps,
        }}
      />
    </PageShell>
  );
}
