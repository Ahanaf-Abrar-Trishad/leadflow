import { NextResponse } from "next/server";
import { discardReplyDraft } from "@/lib/ai/replies";

/** `id` is the enrollment id a Replies thread is keyed by. Throws away
 * Claude's pending reply draft for the thread without sending anything. */
export async function POST(_request: Request, ctx: RouteContext<"/api/outreach/replies/[id]/discard-draft">) {
  const { id } = await ctx.params;
  const discarded = await discardReplyDraft(id);
  if (!discarded) return NextResponse.json({ error: "No draft waiting for this thread" }, { status: 404 });
  return NextResponse.json({ discarded: true });
}
