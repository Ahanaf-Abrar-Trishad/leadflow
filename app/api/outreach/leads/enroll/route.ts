import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { campaigns, leads } from "@/db/schema";
import { leadToContactRow } from "@/lib/leads/toContact";
import { importContactsIntoCampaign } from "@/lib/outreach/contacts/importIntoCampaign";

const enrollLeadsSchema = z.object({
  campaignId: z.uuid(),
  leadIds: z.array(z.uuid()).min(1).max(1000),
});

/** Adds leads to a campaign as contacts. Leads without an email, and
 * disqualified leads, are skipped and counted rather than failing the request. */
export async function POST(request: Request) {
  const parsed = enrollLeadsSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: z.flattenError(parsed.error) }, { status: 400 });
  }
  const { campaignId, leadIds } = parsed.data;

  const [campaign] = await db.select({ status: campaigns.status }).from(campaigns).where(eq(campaigns.id, campaignId));
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (campaign.status === "completed") {
    return NextResponse.json({ error: "That campaign has already completed." }, { status: 409 });
  }

  const eligible = await db
    .select()
    .from(leads)
    .where(and(inArray(leads.id, leadIds), isNotNull(leads.email), inArray(leads.status, ["new", "in_campaign"])));

  const rows = eligible.map((lead) => leadToContactRow({ ...lead, email: lead.email! }));
  const result = await importContactsIntoCampaign(campaignId, rows);

  const enrolledLeadIds = eligible
    .map((lead) => ({ id: lead.id, contactId: result.contactIdByEmail.get(lead.email!.toLowerCase()) }))
    .filter((lead): lead is { id: string; contactId: string } => Boolean(lead.contactId));
  for (const lead of enrolledLeadIds) {
    await db
      .update(leads)
      .set({ status: "in_campaign", contactId: lead.contactId, updatedAt: new Date() })
      .where(eq(leads.id, lead.id));
  }

  return NextResponse.json({
    enrolled: enrolledLeadIds.length,
    skippedNoEmail: leadIds.length - eligible.length,
    skippedSuppressed: result.skippedSuppressed.length,
    schedulingWarning: result.schedulingWarning,
  });
}
