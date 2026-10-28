import { NextResponse } from "next/server";
import { z } from "zod";
import { approveDraft, DraftError } from "@/lib/ai/drafts";

const approveSchema = z.object({
  /** The operator's edited text; omit to approve Claude's draft as written. */
  content: z.string().optional(),
});

export async function POST(request: Request, context: RouteContext<"/api/outreach/drafts/[id]/approve">) {
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  const parsed = approveSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: z.flattenError(parsed.error) }, { status: 400 });
  }

  try {
    await approveDraft(id, parsed.data.content);
  } catch (error) {
    if (error instanceof DraftError) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
  return NextResponse.json({ approved: true });
}
