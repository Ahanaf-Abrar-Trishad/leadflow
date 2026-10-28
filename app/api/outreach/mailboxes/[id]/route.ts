import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { enrollments, mailboxes } from "@/db/schema";

const updateMailboxSchema = z.object({
  fromName: z.string().min(1),
  dailyCap: z.number().int().positive(),
});

export async function PATCH(request: Request, ctx: RouteContext<"/api/outreach/mailboxes/[id]">) {
  const { id } = await ctx.params;

  const [mailbox] = await db.select({ id: mailboxes.id }).from(mailboxes).where(eq(mailboxes.id, id));
  if (!mailbox) return NextResponse.json({ error: "Mailbox not found" }, { status: 404 });

  const body = await request.json();
  const parsed = updateMailboxSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: z.flattenError(parsed.error) }, { status: 400 });
  }

  await db.update(mailboxes).set(parsed.data).where(eq(mailboxes.id, id));
  return NextResponse.json({ updated: true });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/outreach/mailboxes/[id]">) {
  const { id } = await ctx.params;

  const [mailbox] = await db.select({ id: mailboxes.id }).from(mailboxes).where(eq(mailboxes.id, id));
  if (!mailbox) return NextResponse.json({ error: "Mailbox not found" }, { status: 404 });

  const liveEnrollments = await db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(and(eq(enrollments.mailboxId, id), inArray(enrollments.status, ["active", "pending"])));

  if (liveEnrollments.length > 0) {
    return NextResponse.json(
      { error: `Cannot disconnect - ${liveEnrollments.length} enrollment(s) currently depend on this mailbox` },
      { status: 409 },
    );
  }

  await db.delete(mailboxes).where(eq(mailboxes.id, id));
  return NextResponse.json({ deleted: true });
}
