import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { replies } from "@/db/schema";
import { getCurrentUser } from "@/lib/outreach/auth/currentUser";

/** `id` is the enrollment id a Replies thread is keyed by. */
export async function POST(_request: Request, ctx: RouteContext<"/api/outreach/replies/[id]/handle">) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await ctx.params;

  await db
    .update(replies)
    .set({ status: "handled", snoozedUntil: null })
    .where(eq(replies.enrollmentId, id));

  return NextResponse.json({ handled: true });
}
