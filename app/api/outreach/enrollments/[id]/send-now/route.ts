import { NextResponse } from "next/server";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { campaigns, contacts, enrollments, mailboxes, sequenceSteps } from "@/db/schema";
import { getCurrentUser } from "@/lib/outreach/auth/currentUser";
import { loadEncryptionKey } from "@/lib/outreach/crypto";
import { loadUnsubscribeSecret } from "@/lib/outreach/unsubscribe/token";
import { createSmtpTransport } from "@/lib/outreach/transport/smtp";
import { createGmailTransport } from "@/lib/outreach/transport/gmail";
import { enrollmentSendRowSelection, sendEnrollment } from "@/worker/tick";

/**
 * Sends one enrollment's next step immediately, bypassing the wait for its
 * `nextSendAt` (jitter/business-hours) - a manual override for testing or
 * urgent one-offs, not a way to exceed the caps: daily-cap/domain-throttle
 * checks still govern how soon the *next* step gets scheduled, exactly as
 * they do in a normal tick (see sendEnrollment in worker/tick.ts). Higher
 * stakes than pause/resume/start (real mail actually goes out), so this
 * route checks auth unlike those.
 */
export async function POST(_request: Request, ctx: RouteContext<"/api/outreach/enrollments/[id]/send-now">) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await ctx.params;

  const [precheck] = await db
    .select({
      enrollmentStatus: enrollments.status,
      campaignStatus: campaigns.status,
      mailboxHealth: mailboxes.health,
    })
    .from(enrollments)
    .innerJoin(campaigns, eq(campaigns.id, enrollments.campaignId))
    .leftJoin(mailboxes, eq(mailboxes.id, enrollments.mailboxId))
    .where(eq(enrollments.id, id));

  if (!precheck) return NextResponse.json({ error: "Enrollment not found" }, { status: 404 });
  if (precheck.enrollmentStatus !== "active") {
    return NextResponse.json({ error: `Enrollment is ${precheck.enrollmentStatus}, not active` }, { status: 409 });
  }
  if (precheck.campaignStatus !== "active") {
    return NextResponse.json({ error: `Campaign is ${precheck.campaignStatus}, not active` }, { status: 409 });
  }
  if (precheck.mailboxHealth !== "healthy") {
    return NextResponse.json({ error: `Mailbox is ${precheck.mailboxHealth ?? "unassigned"}, not healthy` }, { status: 409 });
  }

  const now = new Date();

  // Atomic claim (same shape as worker/tick.ts's batch claim, scoped to one
  // row): nulling nextSendAt both locks this enrollment against the
  // worker's own tick claiming it concurrently and, since it's already
  // being sent now, means there's nothing left to "wait for" - the normal
  // send flow below schedules the *next* step's nextSendAt fresh. The
  // isNotNull check is the same "not already mid-claim" guard the tick's
  // claim relies on (see worker/tick.ts) - without it, this UPDATE would
  // happily re-claim a row the tick had already claimed a moment earlier
  // (nextSendAt already null there doesn't change enrollments.status),
  // causing a double-send if a "send now" click races the worker's tick.
  const claimed = await db
    .update(enrollments)
    .set({ nextSendAt: null })
    .where(and(eq(enrollments.id, id), eq(enrollments.status, "active"), isNotNull(enrollments.nextSendAt)))
    .returning({ id: enrollments.id });

  if (claimed.length === 0) {
    return NextResponse.json({ error: "Enrollment is no longer eligible to send (changed concurrently)" }, { status: 409 });
  }

  const [row] = await db
    .select(enrollmentSendRowSelection())
    .from(enrollments)
    .innerJoin(campaigns, eq(campaigns.id, enrollments.campaignId))
    .innerJoin(mailboxes, eq(mailboxes.id, enrollments.mailboxId))
    .innerJoin(contacts, eq(contacts.id, enrollments.contactId))
    .innerJoin(
      sequenceSteps,
      and(eq(sequenceSteps.campaignId, campaigns.id), eq(sequenceSteps.stepOrder, enrollments.currentStep)),
    )
    .where(eq(enrollments.id, id));

  if (!row) {
    // Claimed but the join came up empty (e.g. no sequence step at the
    // current stepOrder) - release the claim rather than losing the
    // enrollment's schedule silently.
    await db.update(enrollments).set({ nextSendAt: now }).where(eq(enrollments.id, id));
    return NextResponse.json({ error: "Enrollment is missing data required to send" }, { status: 422 });
  }

  const ok = await sendEnrollment(row, {
    now,
    encryptionKey: loadEncryptionKey(),
    unsubscribeSecret: loadUnsubscribeSecret(),
    createSmtpTransportClient: createSmtpTransport,
    createGmailTransportClient: createGmailTransport,
  });

  return NextResponse.json({ sent: ok });
}
