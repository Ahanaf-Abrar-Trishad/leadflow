import { NextResponse } from "next/server";
import { z } from "zod";
import { desc } from "drizzle-orm";
import { db, runAtomic } from "@/db/client";
import { campaigns, campaignMailboxes, sequenceSteps } from "@/db/schema";
import { createCampaignSchema } from "@/lib/outreach/campaigns/validation";

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = createCampaignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: z.flattenError(parsed.error) }, { status: 400 });
  }
  const { steps, mailboxIds, ...campaignFields } = parsed.data;

  const campaign = await runAtomic(async (tx) => {
    const [inserted] = await tx.insert(campaigns).values(campaignFields).returning();
    await tx.insert(campaignMailboxes).values(mailboxIds.map((mailboxId) => ({ campaignId: inserted.id, mailboxId })));
    await tx.insert(sequenceSteps).values(
      steps.map((step, index) => ({
        campaignId: inserted.id,
        stepOrder: index + 1,
        subjectTemplate: step.subjectTemplate,
        bodyTemplate: step.bodyTemplate,
        delayDays: step.delayDays,
      })),
    );
    return inserted;
  });

  return NextResponse.json({ campaign }, { status: 201 });
}

export async function GET() {
  const rows = await db.select().from(campaigns).orderBy(desc(campaigns.createdAt));
  return NextResponse.json({ campaigns: rows });
}
