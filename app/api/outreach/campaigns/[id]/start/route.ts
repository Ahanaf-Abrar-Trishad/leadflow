import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, runAtomic } from "@/db/client";
import { campaigns, enrollments } from "@/db/schema";
import { planCampaignEnrollment } from "@/lib/outreach/campaigns/enrollNewContacts";

export async function POST(_request: Request, ctx: RouteContext<"/api/outreach/campaigns/[id]/start">) {
  const { id } = await ctx.params;

  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id));
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (campaign.status !== "draft") {
    return NextResponse.json({ error: `Campaign is already ${campaign.status}` }, { status: 409 });
  }

  const plan = await planCampaignEnrollment(campaign);

  if (plan.skippedReason === "no_healthy_mailboxes") {
    return NextResponse.json({ error: "No healthy mailboxes in this campaign's pool" }, { status: 422 });
  }
  if (plan.skippedReason === "no_sequence_steps") {
    return NextResponse.json({ error: "Campaign has no sequence steps" }, { status: 422 });
  }
  if (plan.skippedReason === "no_pending_contacts") {
    return NextResponse.json({ error: "No pending contacts to enroll" }, { status: 422 });
  }
  if (plan.skippedReason === "preflight_failed") {
    return NextResponse.json({ error: "Preflight checks failed", preflight: plan.preflight }, { status: 422 });
  }

  await runAtomic(async (tx) => {
    for (const item of plan.scheduled) {
      await tx
        .update(enrollments)
        .set({ status: "active", mailboxId: item.mailboxId, nextSendAt: item.nextSendAt })
        .where(eq(enrollments.id, item.id));
    }
    await tx.update(campaigns).set({ status: "active" }).where(eq(campaigns.id, id));
  });

  return NextResponse.json({ started: true, enrolled: plan.scheduled.length });
}
