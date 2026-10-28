import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { contacts, enrollments, mailboxes, messages, replies } from "@/db/schema";
import { decrypt, loadEncryptionKey } from "@/lib/outreach/crypto";
import { parseMailboxCredentials } from "@/lib/outreach/mailboxes/credentials";
import { createSmtpTransport } from "@/lib/outreach/transport/smtp";
import { createGmailTransport } from "@/lib/outreach/transport/gmail";
import { buildThreadHeaders } from "@/lib/outreach/templates/threading";
import { getThreadMessages } from "@/lib/outreach/replies/queries";
import { getCurrentUser } from "@/lib/outreach/auth/currentUser";

/** `id` is the enrollment id a Replies thread is keyed by. Sends a free-text
 * reply from the enrollment's assigned mailbox, threaded into the same
 * conversation, then marks the thread handled - "sending stops for this
 * contact either way" per the Replies composer's own helper text. */
export async function POST(request: Request, ctx: RouteContext<"/api/outreach/replies/[id]/reply">) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "Reply text is required" }, { status: 422 });

  const [enrollment] = await db.select().from(enrollments).where(eq(enrollments.id, id));
  if (!enrollment) return NextResponse.json({ error: "Enrollment not found" }, { status: 404 });
  if (!enrollment.mailboxId) {
    return NextResponse.json({ error: "This enrollment has no assigned mailbox to send from" }, { status: 422 });
  }

  const [contact] = await db.select({ email: contacts.email }).from(contacts).where(eq(contacts.id, enrollment.contactId));
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  const [mailbox] = await db.select().from(mailboxes).where(eq(mailboxes.id, enrollment.mailboxId));
  if (!mailbox) return NextResponse.json({ error: "Mailbox not found" }, { status: 404 });

  const [outboundMessages, inboundReplies] = await Promise.all([
    db
      .select({ rfcMessageId: messages.rfcMessageId, providerThreadId: messages.providerThreadId, at: messages.sentAt })
      .from(messages)
      .where(eq(messages.enrollmentId, id))
      .orderBy(asc(messages.sentAt)),
    db
      .select({ rfcMessageId: replies.rfcMessageId, providerThreadId: replies.providerThreadId, at: replies.createdAt })
      .from(replies)
      .where(and(eq(replies.enrollmentId, id), eq(replies.direction, "in")))
      .orderBy(asc(replies.createdAt)),
  ]);

  const timeline = [...outboundMessages, ...inboundReplies].sort((a, b) => a.at.getTime() - b.at.getTime());
  const priorMessageIds = timeline.map((t) => t.rfcMessageId).filter((v): v is string => Boolean(v));
  const threadId = [...timeline].reverse().find((t) => t.providerThreadId)?.providerThreadId ?? undefined;
  const threadHeaders = buildThreadHeaders(priorMessageIds);

  const threadMessages = await getThreadMessages(id);
  const lastSubject = threadMessages[threadMessages.length - 1]?.subject || "Following up";
  const subject = /^re:/i.test(lastSubject) ? lastSubject : `Re: ${lastSubject}`;

  const encryptionKey = loadEncryptionKey();
  const credentials = parseMailboxCredentials(decrypt(mailbox.encryptedCredentials, encryptionKey));

  const transport =
    mailbox.provider === "gmail_oauth"
      ? credentials.oauth && createGmailTransport(credentials.oauth)
      : credentials.smtp && createSmtpTransport(credentials.smtp);
  if (!transport) return NextResponse.json({ error: "Mailbox has no usable send credentials" }, { status: 422 });

  const result = await transport.send({
    to: contact.email,
    fromName: mailbox.fromName,
    fromEmail: mailbox.fromEmail,
    subject,
    text,
    inReplyTo: threadHeaders.inReplyTo,
    references: threadHeaders.references,
    threadId,
  });

  await db.insert(replies).values({
    enrollmentId: id,
    mailboxId: mailbox.id,
    direction: "out",
    rfcMessageId: result.rfcMessageId,
    providerThreadId: result.providerThreadId ?? threadId ?? null,
    fromAddress: mailbox.fromEmail,
    subject,
    snippet: text.slice(0, 160),
    bodyText: text,
  });

  await db.update(replies).set({ status: "handled", snoozedUntil: null }).where(eq(replies.enrollmentId, id));

  return NextResponse.json({ sent: true });
}
