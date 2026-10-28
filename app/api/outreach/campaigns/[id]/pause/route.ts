import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { campaigns } from "@/db/schema";

export async function PATCH(_request: Request, ctx: RouteContext<"/api/outreach/campaigns/[id]/pause">) {
  const { id } = await ctx.params;

  const [campaign] = await db.select({ status: campaigns.status }).from(campaigns).where(eq(campaigns.id, id));
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (campaign.status !== "active") {
    return NextResponse.json({ error: `Campaign is ${campaign.status}, not active` }, { status: 409 });
  }

  await db.update(campaigns).set({ status: "paused" }).where(eq(campaigns.id, id));
  return NextResponse.json({ paused: true });
}
