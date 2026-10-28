import { NextResponse } from "next/server";
import { z } from "zod";
import { ProposalError, revokeProposal } from "@/lib/proposals/proposals";

const revokeSchema = z.object({ to: z.enum(["draft", "withdrawn"]) });

/** Back to draft for changes, or withdrawn. Every link already sent stops working. */
export async function POST(request: Request, ctx: RouteContext<"/api/outreach/proposals/[id]/revoke">) {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  const parsed = revokeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: z.flattenError(parsed.error) }, { status: 400 });
  try {
    await revokeProposal(id, parsed.data.to);
  } catch (error) {
    if (error instanceof ProposalError) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
  return NextResponse.json({ status: parsed.data.to });
}
