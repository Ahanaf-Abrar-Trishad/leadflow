import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, runAtomic } from "@/db/client";
import { campaigns, campaignMailboxes, sequenceSteps } from "@/db/schema";
import { createCampaignSchema } from "@/lib/outreach/campaigns/validation";

export async function PATCH(request: Request, ctx: RouteContext<"/api/outreach/campaigns/[id]">) {
  const { id } = await ctx.params;

  const [campaign] = await db.select({ status: campaigns.status }).from(campaigns).where(eq(campaigns.id, id));
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (campaign.status !== "draft") {
    return NextResponse.json({ error: "Only a draft campaign can be edited" }, { status: 409 });
  }

  const body = await request.json();
  const parsed = createCampaignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: z.flattenError(parsed.error) }, { status: 400 });
  }
  const { steps, mailboxIds, ...campaignFields } = parsed.data;

  await runAtomic(async (tx) => {
    await tx.update(campaigns).set(campaignFields).where(eq(campaigns.id, id));

    await tx.delete(campaignMailboxes).where(eq(campaignMailboxes.campaignId, id));
    await tx.insert(campaignMailboxes).values(mailboxIds.map((mailboxId) => ({ campaignId: id, mailboxId })));

    await tx.delete(sequenceSteps).where(eq(sequenceSteps.campaignId, id));
    await tx.insert(sequenceSteps).values(
      steps.map((step, index) => ({
        campaignId: id,
        stepOrder: index + 1,
        subjectTemplate: step.subjectTemplate,
        bodyTemplate: step.bodyTemplate,
        delayDays: step.delayDays,
      })),
    );
  });

  return NextResponse.json({ updated: true });
}
