import { NextResponse } from "next/server";
import { z } from "zod";
import { and, inArray, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { leads } from "@/db/schema";

const setStatusSchema = z.object({
  leadIds: z.array(z.uuid()).min(1).max(1000),
  status: z.enum(["new", "disqualified"]),
});

/** Disqualifies leads (or restores them to "new"). A lead already in a
 * campaign keeps that status - remove it from the campaign instead. */
export async function POST(request: Request) {
  const parsed = setStatusSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: z.flattenError(parsed.error) }, { status: 400 });
  }
  const { leadIds, status } = parsed.data;

  const updated = await db
    .update(leads)
    .set({ status, updatedAt: new Date() })
    .where(and(inArray(leads.id, leadIds), ne(leads.status, "in_campaign")))
    .returning({ id: leads.id });

  return NextResponse.json({ updated: updated.length });
}
