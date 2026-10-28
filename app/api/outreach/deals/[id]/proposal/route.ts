import { NextResponse } from "next/server";
import { z } from "zod";
import { openProposalForDeal, ProposalError } from "@/lib/proposals/proposals";

/** Opens the deal's live proposal, creating an empty one if needed. */
export async function POST(_request: Request, ctx: RouteContext<"/api/outreach/deals/[id]/proposal">) {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  try {
    const proposal = await openProposalForDeal(id);
    return NextResponse.json({ id: proposal.id });
  } catch (error) {
    if (error instanceof ProposalError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}
