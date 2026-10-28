import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { mailboxes } from "@/db/schema";

export async function PATCH(_request: Request, ctx: RouteContext<"/api/outreach/mailboxes/[id]/resume">) {
  const { id } = await ctx.params;

  const [mailbox] = await db.select({ health: mailboxes.health }).from(mailboxes).where(eq(mailboxes.id, id));
  if (!mailbox) return NextResponse.json({ error: "Mailbox not found" }, { status: 404 });
  if (mailbox.health !== "paused") {
    return NextResponse.json({ error: `Mailbox is not paused (current health: ${mailbox.health})` }, { status: 409 });
  }

  await db.update(mailboxes).set({ health: "healthy" }).where(eq(mailboxes.id, id));
  return NextResponse.json({ resumed: true });
}
