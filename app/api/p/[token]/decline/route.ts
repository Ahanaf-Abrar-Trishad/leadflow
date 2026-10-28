import { NextResponse } from "next/server";
import { z } from "zod";
import { declineProposal, getProposalByToken, ProposalError } from "@/lib/proposals/proposals";

/* Public, like accept: the signed token in the path is the only key. */
const declineSchema = z.object({ reason: z.string().max(1000).default("") });

export async function POST(request: Request, ctx: RouteContext<"/api/p/[token]/decline">) {
  const { token } = await ctx.params;
  const proposal = await getProposalByToken(token);
  if (!proposal) return NextResponse.json({ error: "This link is no longer valid." }, { status: 404 });
  const parsed = declineSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  try {
    await declineProposal(proposal.id, parsed.data.reason);
  } catch (error) {
    if (error instanceof ProposalError) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
  return NextResponse.json({ declined: true });
}
