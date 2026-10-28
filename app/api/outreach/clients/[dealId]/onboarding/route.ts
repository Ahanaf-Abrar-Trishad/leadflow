import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { deals } from "@/db/schema";
import { startOnboarding } from "@/lib/onboarding/onboarding";

/** Starts onboarding by hand, for a client who paid outside LeadFlow. */
export async function POST(_request: Request, ctx: RouteContext<"/api/outreach/clients/[dealId]/onboarding">) {
  const { dealId } = await ctx.params;
  if (!z.uuid().safeParse(dealId).success) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  const [deal] = await db.select({ id: deals.id }).from(deals).where(eq(deals.id, dealId));
  if (!deal) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  const onboarding = await startOnboarding(dealId);
  return NextResponse.json({ onboardingId: onboarding.id });
}
