import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { suppressions } from "@/db/schema";

export async function DELETE(_request: Request, ctx: RouteContext<"/api/outreach/suppressions/[id]">) {
  const { id } = await ctx.params;

  const [row] = await db.select({ id: suppressions.id }).from(suppressions).where(eq(suppressions.id, id));
  if (!row) return NextResponse.json({ error: "Suppression not found" }, { status: 404 });

  await db.delete(suppressions).where(eq(suppressions.id, id));
  return NextResponse.json({ removed: true });
}
