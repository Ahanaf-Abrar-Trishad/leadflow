import { NextResponse } from "next/server";
import { z } from "zod";
import { DraftError, rejectDraft } from "@/lib/ai/drafts";

export async function POST(_request: Request, context: RouteContext<"/api/outreach/drafts/[id]/reject">) {
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Draft not found" }, { status: 404 });

  try {
    await rejectDraft(id);
  } catch (error) {
    if (error instanceof DraftError) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
  return NextResponse.json({ rejected: true });
}
