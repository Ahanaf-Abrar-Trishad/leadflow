import { config } from "dotenv";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { contacts, enrollments, events, mailboxes, messages, replies, suppressions, workerHeartbeats } from "@/db/schema";
import { decrypt, loadEncryptionKey } from "@/lib/outreach/crypto";
import { parseMailboxCredentials } from "@/lib/outreach/mailboxes/credentials";
import { createImapClient, type ImapClient, type InboxMessage } from "@/lib/outreach/transport/imap";
import { createGmailPollClient, type GmailPollClient } from "@/lib/outreach/transport/gmailPoll";
import type { ImapCredentials, GoogleOAuthCredentials } from "@/lib/outreach/mailboxes/credentials";
import { isDsnMessage, extractStatusCode, classifyStatusCode } from "@/lib/outreach/poller/bounce";
import { matchReplies } from "@/lib/outreach/poller/replyMatching";
import { parseInboundMessage } from "@/lib/outreach/replies/parseInboundMessage";
import { computeBounceRate } from "@/lib/outreach/deliverability/bounceRate";

config({ quiet: true });

const POLL_INTERVAL_MS = 3 * 60 * 1000;
const BOUNCE_RATE_THRESHOLD = 0.03;
const TRAILING_WINDOW = 50;

export interface PollResult {
  mailboxesPolled: number;
  replied: number;
  bounced: number;
}

export async function runPoll(
  now: Date = new Date(),
  createImapPollClient: (credentials: ImapCredentials) => ImapClient = createImapClient,
  createGmailPollClientFactory: (credentials: GoogleOAuthCredentials) => GmailPollClient = createGmailPollClient,
): Promise<PollResult> {
  const encryptionKey = loadEncryptionKey();

  const activeMailboxes = await db
    .selectDistinct({
      mailboxId: mailboxes.id,
      provider: mailboxes.provider,
      encryptedCredentials: mailboxes.encryptedCredentials,
      lastPolledAt: mailboxes.lastPolledAt,
      lastHistoryId: mailboxes.lastHistoryId,
      createdAt: mailboxes.createdAt,
    })
    .from(mailboxes)
    .innerJoin(enrollments, and(eq(enrollments.mailboxId, mailboxes.id), eq(enrollments.status, "active")));

  let mailboxesPolled = 0;
  let replied = 0;
  let bounced = 0;

  for (const mailbox of activeMailboxes) {
    const credentials = parseMailboxCredentials(decrypt(mailbox.encryptedCredentials, encryptionKey));

    let inboxMessages: InboxMessage[];
    let updates: { lastPolledAt?: Date; lastHistoryId?: string | null };

    if (mailbox.provider === "gmail_oauth") {
      if (!credentials.oauth) continue; // shouldn't happen by construction, but never crash the poll loop over it
      const client = createGmailPollClientFactory(credentials.oauth);
      const result = await client.fetchNew(mailbox.lastHistoryId, mailbox.createdAt);
      inboxMessages = result.messages;
      updates = { lastHistoryId: result.newHistoryId };
    } else if (credentials.imap) {
      const since = mailbox.lastPolledAt ?? new Date(0);
      const client = createImapPollClient(credentials.imap);
      inboxMessages = await client.fetchSince(since);
      updates = { lastPolledAt: now };
    } else {
      continue; // SMTP mailbox connected before Phase 2, no IMAP details yet
    }

    mailboxesPolled += 1;

    const repliedMessagesByAddress = new Map<string, InboxMessage[]>();

    for (const message of inboxMessages) {
      if (isDsnMessage(message.from, message.source)) {
        const status = classifyStatusCode(extractStatusCode(message.source));
        if (status === "hard") {
          bounced += await handleBounce(mailbox.mailboxId, message.source);
        }
      } else if (message.from) {
        const existing = repliedMessagesByAddress.get(message.from);
        if (existing) existing.push(message);
        else repliedMessagesByAddress.set(message.from, [message]);
      }
    }

    if (repliedMessagesByAddress.size > 0) {
      replied += await handleReplies(mailbox.mailboxId, repliedMessagesByAddress);
    }

    await db.update(mailboxes).set(updates).where(eq(mailboxes.id, mailbox.mailboxId));
    await checkCircuitBreaker(mailbox.mailboxId);
  }

  const result = { mailboxesPolled, replied, bounced };
  await db
    .insert(workerHeartbeats)
    .values({ process: "poller", lastRunAt: now, lastResult: result })
    .onConflictDoUpdate({ target: workerHeartbeats.process, set: { lastRunAt: now, lastResult: result } });

  return result;
}

async function checkCircuitBreaker(mailboxId: string): Promise<void> {
  const trailing = await db
    .select({ enrollmentStatus: enrollments.status })
    .from(messages)
    .innerJoin(enrollments, eq(enrollments.id, messages.enrollmentId))
    .where(eq(enrollments.mailboxId, mailboxId))
    .orderBy(desc(messages.sentAt))
    .limit(TRAILING_WINDOW);

  const result = computeBounceRate(trailing);
  if (!result || result.rate < BOUNCE_RATE_THRESHOLD) return;

  const [mailbox] = await db.select({ health: mailboxes.health }).from(mailboxes).where(eq(mailboxes.id, mailboxId));
  if (mailbox?.health === "paused") return; // already paused - don't log a repeat event every poll cycle

  await db.update(mailboxes).set({ health: "paused" }).where(eq(mailboxes.id, mailboxId));
  await db.insert(events).values({
    type: "mailbox_paused",
    payload: { mailboxId, rate: result.rate, sampleSize: result.sampleSize },
  });
}

async function handleReplies(mailboxId: string, repliedMessagesByAddress: Map<string, InboxMessage[]>): Promise<number> {
  const activeForMailbox = await db
    .select({ enrollmentId: enrollments.id, contactEmail: contacts.email })
    .from(enrollments)
    .innerJoin(contacts, eq(contacts.id, enrollments.contactId))
    .where(and(eq(enrollments.mailboxId, mailboxId), eq(enrollments.status, "active")));

  const repliedEnrollmentIds = matchReplies(
    activeForMailbox.map((row) => ({ enrollmentId: row.enrollmentId, contactEmail: row.contactEmail })),
    new Set(repliedMessagesByAddress.keys()),
  );
  const emailByEnrollmentId = new Map(activeForMailbox.map((row) => [row.enrollmentId, row.contactEmail]));

  for (const enrollmentId of repliedEnrollmentIds) {
    await db
      .update(enrollments)
      .set({ status: "replied", nextSendAt: null })
      .where(eq(enrollments.id, enrollmentId));

    const email = emailByEnrollmentId.get(enrollmentId)?.toLowerCase() ?? "";
    const inboundMessages = repliedMessagesByAddress.get(email) ?? [];

    for (const message of inboundMessages) {
      const parsed = await parseInboundMessage(message.source);
      await db.insert(replies).values({
        enrollmentId,
        mailboxId,
        rfcMessageId: parsed.rfcMessageId,
        fromAddress: message.from,
        subject: parsed.subject,
        snippet: parsed.snippet,
        bodyText: parsed.bodyText,
        unsubscribeRequested: parsed.unsubscribeRequested,
      });
    }
  }

  return repliedEnrollmentIds.length;
}

/** A hard-bounce DSN doesn't reliably say *which* enrollment it's for in a
 * form worth parsing (the original recipient address is usually buried in
 * an attached message/rfc822 part, not a clean header) - instead, since a
 * bounce implies the target address is undeliverable everywhere, every
 * currently-active enrollment for a contact that has *any* delivery
 * attempt through this mailbox and matches an address referenced in the
 * bounce text is suppressed. In practice this DSN carries the recipient's
 * address in its body, so a simple substring search against each active
 * contact's email is enough without a MIME parser. */
async function handleBounce(mailboxId: string, dsnSource: string): Promise<number> {
  const activeForMailbox = await db
    .select({ enrollmentId: enrollments.id, contactEmail: contacts.email })
    .from(enrollments)
    .innerJoin(contacts, eq(contacts.id, enrollments.contactId))
    .where(and(eq(enrollments.mailboxId, mailboxId), eq(enrollments.status, "active")));

  const lowerSource = dsnSource.toLowerCase();
  let count = 0;

  for (const row of activeForMailbox) {
    if (!lowerSource.includes(row.contactEmail.toLowerCase())) continue;

    await db.update(enrollments).set({ status: "bounced", nextSendAt: null }).where(eq(enrollments.id, row.enrollmentId));
    await db.insert(suppressions).values({ email: row.contactEmail, reason: "hard_bounce" }).onConflictDoNothing();
    count += 1;
  }

  return count;
}

/** See worker/tick.ts's startTickLoop for why this is exported. */
export function startPollLoop(): void {
  console.log(`Outreach poller started, polling every ${POLL_INTERVAL_MS / 1000}s`);
  const loop = async () => {
    try {
      const result = await runPoll();
      if (result.mailboxesPolled > 0) {
        console.log(`poll: mailboxes=${result.mailboxesPolled} replied=${result.replied} bounced=${result.bounced}`);
      }
    } catch (error) {
      console.error("poll failed", error);
    } finally {
      setTimeout(loop, POLL_INTERVAL_MS);
    }
  };
  void loop();
}

if (require.main === module) {
  startPollLoop();
}
