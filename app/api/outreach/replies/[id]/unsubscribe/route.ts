import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, runAtomic } from "@/db/client";
import { contacts, enrollments, replies, suppressions } from "@/db/schema";
import { getCurrentUser } from "@/lib/outreach/auth/currentUser";

/** `id` is the enrollment id a Replies thread is keyed by. Mirrors the
 * existing suppress-on-hard-bounce logic in worker/poller.ts - same
 * `suppressions` table, same "insert then never send again" effect. */
export async function POST(_request: Request, ctx: RouteContext<"/api/outreach/replies/[id]/unsubscribe">) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await ctx.params;

  const [enrollment] = await db
    .select({ id: enrollments.id, contactId: enrollments.contactId })
    .from(enrollments)
    .where(eq(enrollments.id, id));
  if (!enrollment) return NextResponse.json({ error: "Enrollment not found" }, { status: 404 });

  const [contact] = await db.select({ email: contacts.email }).from(contacts).where(eq(contacts.id, enrollment.contactId));
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  await runAtomic(async (tx) => {
    await tx.update(enrollments).set({ status: "unsubscribed", nextSendAt: null }).where(eq(enrollments.id, id));
    await tx.insert(suppressions).values({ email: contact.email, reason: "unsubscribed" }).onConflictDoNothing();
    await tx.update(replies).set({ status: "handled", snoozedUntil: null }).where(eq(replies.enrollmentId, id));
  });

  return NextResponse.json({ unsubscribed: true });
}
