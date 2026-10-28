import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/outreach/auth/currentUser";
import { sendThreadReply, ThreadSendError } from "@/lib/outreach/replies/send";
import { markReplyDraftSent } from "@/lib/ai/replies";

/** `id` is the enrollment id a Replies thread is keyed by. Sends a free-text
 * reply from the enrollment's assigned mailbox, threaded into the same
 * conversation, then marks the thread handled - "sending stops for this
 * contact either way" per the Replies composer's own helper text. */
export async function POST(request: Request, ctx: RouteContext<"/api/outreach/replies/[id]/reply">) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  /** Set when the operator started from Claude's draft, so it is recorded
   * as sent (and whether they edited it) instead of left pending. */
  const draftId = typeof body?.draftId === "string" ? body.draftId : undefined;
  if (!text) return NextResponse.json({ error: "Reply text is required" }, { status: 422 });

  try {
    await sendThreadReply(id, text);
  } catch (error) {
    if (error instanceof ThreadSendError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
  if (draftId) await markReplyDraftSent(draftId, id, text);

  return NextResponse.json({ sent: true });
}
