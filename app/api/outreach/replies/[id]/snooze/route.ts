import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { replies } from "@/db/schema";
import { getCurrentUser } from "@/lib/outreach/auth/currentUser";

const SNOOZE_DAYS = 3;

/** `id` is the enrollment id a Replies thread is keyed by. */
export async function POST(_request: Request, ctx: RouteContext<"/api/outreach/replies/[id]/snooze">) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await ctx.params;
  const snoozedUntil = new Date(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000);

  await db
    .update(replies)
    .set({ status: "snoozed", snoozedUntil })
    .where(eq(replies.enrollmentId, id));

  return NextResponse.json({ snoozed: true, snoozedUntil });
}
