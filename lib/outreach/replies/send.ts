import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { contacts, enrollments, mailboxes, messages, replies } from "@/db/schema";
import { decrypt, loadEncryptionKey } from "@/lib/outreach/crypto";
import { parseMailboxCredentials } from "@/lib/outreach/mailboxes/credentials";
import { createSmtpTransport } from "@/lib/outreach/transport/smtp";
import { createGmailTransport } from "@/lib/outreach/transport/gmail";
import { buildThreadHeaders } from "@/lib/outreach/templates/threading";
import { getThreadMessages } from "./queries";

/** A problem the operator can act on, with the HTTP status to answer with. */
export class ThreadSendError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * Sends free text from the enrollment's assigned mailbox, threaded into the
 * same conversation, records it as an outbound reply and marks the thread
 * handled. Only ever called from an operator's own action (sending a reply,
 * sending a proposal), never by a background job or by Claude.
 */
export async function sendThreadReply(enrollmentId: string, text: string): Promise<void> {
  const [enrollment] = await db.select().from(enrollments).where(eq(enrollments.id, enrollmentId));
  if (!enrollment) throw new ThreadSendError("Enrollment not found", 404);
  if (!enrollment.mailboxId) throw new ThreadSendError("This enrollment has no assigned mailbox to send from", 422);

  const [contact] = await db.select({ email: contacts.email }).from(contacts).where(eq(contacts.id, enrollment.contactId));
  if (!contact) throw new ThreadSendError("Contact not found", 404);

  const [mailbox] = await db.select().from(mailboxes).where(eq(mailboxes.id, enrollment.mailboxId));
  if (!mailbox) throw new ThreadSendError("Mailbox not found", 404);

  const [outboundMessages, inboundReplies] = await Promise.all([
    db
      .select({ rfcMessageId: messages.rfcMessageId, providerThreadId: messages.providerThreadId, at: messages.sentAt })
      .from(messages)
      .where(eq(messages.enrollmentId, enrollmentId))
      .orderBy(asc(messages.sentAt)),
    db
      .select({ rfcMessageId: replies.rfcMessageId, providerThreadId: replies.providerThreadId, at: replies.createdAt })
      .from(replies)
      .where(and(eq(replies.enrollmentId, enrollmentId), eq(replies.direction, "in")))
      .orderBy(asc(replies.createdAt)),
  ]);

  const timeline = [...outboundMessages, ...inboundReplies].sort((a, b) => a.at.getTime() - b.at.getTime());
  const priorMessageIds = timeline.map((t) => t.rfcMessageId).filter((v): v is string => Boolean(v));
  const threadId = [...timeline].reverse().find((t) => t.providerThreadId)?.providerThreadId ?? undefined;
  const threadHeaders = buildThreadHeaders(priorMessageIds);

  const threadMessages = await getThreadMessages(enrollmentId);
  const lastSubject = threadMessages[threadMessages.length - 1]?.subject || "Following up";
  const subject = /^re:/i.test(lastSubject) ? lastSubject : `Re: ${lastSubject}`;

  const encryptionKey = loadEncryptionKey();
  const credentials = parseMailboxCredentials(decrypt(mailbox.encryptedCredentials, encryptionKey));

  const transport =
    mailbox.provider === "gmail_oauth"
      ? credentials.oauth && createGmailTransport(credentials.oauth)
      : credentials.smtp && createSmtpTransport(credentials.smtp);
  if (!transport) throw new ThreadSendError("Mailbox has no usable send credentials", 422);

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
    enrollmentId,
    mailboxId: mailbox.id,
    direction: "out",
    rfcMessageId: result.rfcMessageId,
    providerThreadId: result.providerThreadId ?? threadId ?? null,
    fromAddress: mailbox.fromEmail,
    subject,
    snippet: text.slice(0, 160),
    bodyText: text,
  });

  await db.update(replies).set({ status: "handled", snoozedUntil: null }).where(eq(replies.enrollmentId, enrollmentId));
}
