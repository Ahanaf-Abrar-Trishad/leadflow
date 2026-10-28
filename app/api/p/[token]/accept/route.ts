import { NextResponse } from "next/server";
import { z } from "zod";
import { acceptProposal, getProposalByToken, ProposalError } from "@/lib/proposals/proposals";
import { clientIp } from "@/lib/proposals/publicRequest";

/*
 * Public: the client signs from the proposal link. Outside proxy.ts's session
 * gate on purpose; the signed, versioned token in the path is the only key.
 */
const acceptSchema = z.object({
  name: z.string().trim().min(2).max(200),
  email: z.email().max(320),
  agreed: z.literal(true),
});

export async function POST(request: Request, ctx: RouteContext<"/api/p/[token]/accept">) {
  const { token } = await ctx.params;
  const proposal = await getProposalByToken(token);
  if (!proposal) return NextResponse.json({ error: "This link is no longer valid." }, { status: 404 });

  const parsed = acceptSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Type your full name and email, and tick the box to agree." }, { status: 400 });
  }

  try {
    await acceptProposal(proposal.id, {
      ...parsed.data,
      ip: clientIp(request),
      userAgent: request.headers.get("user-agent"),
    });
  } catch (error) {
    if (error instanceof ProposalError) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
  return NextResponse.json({ accepted: true });
}
