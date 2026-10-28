import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureDealForEnrollment } from "@/lib/deals/deals";

/** `id` is the enrollment id a Replies thread is keyed by. Adds the thread's
 * contact to the pipeline (a no-op if they already have a deal). */
export async function POST(_request: Request, ctx: RouteContext<"/api/outreach/replies/[id]/pipeline">) {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  const result = await ensureDealForEnrollment(id);
  if (!result) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  return NextResponse.json(result, { status: result.created ? 201 : 200 });
}
