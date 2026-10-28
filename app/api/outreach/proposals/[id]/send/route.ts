import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { deals } from "@/db/schema";
import { getProposal, markProposalSent, ProposalError, proposalUrl } from "@/lib/proposals/proposals";
import { sendThreadReply, ThreadSendError } from "@/lib/outreach/replies/send";

const sendSchema = z.discriminatedUnion("mode", [
  /** Just make the link live; the operator shares it themselves. */
  z.object({ mode: z.literal("link") }),
  /** Make it live and email the link in the deal's conversation thread. */
  z.object({ mode: z.literal("email"), message: z.string().trim().min(1).max(3000) }),
]);

export async function POST(request: Request, ctx: RouteContext<"/api/outreach/proposals/[id]/send">) {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  const parsed = sendSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: z.flattenError(parsed.error) }, { status: 400 });

  const proposal = await getProposal(id);
  if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

  let enrollmentId: string | null = null;
  if (parsed.data.mode === "email") {
    const [deal] = await db.select({ enrollmentId: deals.enrollmentId }).from(deals).where(eq(deals.id, proposal.dealId));
    enrollmentId = deal?.enrollmentId ?? null;
    if (!enrollmentId) {
      return NextResponse.json({ error: "This deal has no email conversation to send in. Copy the link instead." }, { status: 422 });
    }
  }

  let sent;
  try {
    sent = await markProposalSent(id);
  } catch (error) {
    if (error instanceof ProposalError) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
  const url = proposalUrl(sent);

  if (parsed.data.mode === "email" && enrollmentId) {
    try {
      await sendThreadReply(enrollmentId, `${parsed.data.message}\n\n${url}`);
    } catch (error) {
      // The link is live either way; say so, so the operator can share it by hand.
      const message = error instanceof ThreadSendError ? error.message : "the email could not be sent";
      return NextResponse.json({ url, emailed: false, error: `The proposal is live, but ${message}. Copy the link instead.` }, { status: 502 });
    }
  }

  return NextResponse.json({ url, emailed: parsed.data.mode === "email" });
}
