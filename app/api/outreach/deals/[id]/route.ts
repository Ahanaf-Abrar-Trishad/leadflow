import { NextResponse } from "next/server";
import { z } from "zod";
import { updateDeal } from "@/lib/deals/deals";
import { DEAL_STAGES } from "@/lib/deals/stages";

const patchDealSchema = z.object({
  stage: z.enum(DEAL_STAGES).optional(),
  valueUsd: z.number().int().min(0).max(10_000_000).nullable().optional(),
  notes: z.string().max(5000).optional(),
  lostReason: z.string().max(500).nullable().optional(),
});

export async function PATCH(request: Request, ctx: RouteContext<"/api/outreach/deals/[id]">) {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  const parsed = patchDealSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: z.flattenError(parsed.error) }, { status: 400 });
  }
  const found = await updateDeal(id, parsed.data);
  if (!found) return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  return NextResponse.json({ updated: true });
}
