import { and, count, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { contacts, enrollments, messages } from "@/db/schema";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Drizzle's count() aggregate applies .mapWith(Number) itself, so it
// always returns a genuine JS number - not the raw JS string postgres.js
// returns bigint/int8 columns as by default. Used instead of a raw
// `sql<number>` fragment for that reason.
export async function countSentByMailboxToday(mailboxId: string, now: Date): Promise<number> {
  const since = new Date(now.getTime() - ONE_DAY_MS);
  const [row] = await db
    .select({ count: count() })
    .from(messages)
    .innerJoin(enrollments, eq(enrollments.id, messages.enrollmentId))
    .where(and(eq(enrollments.mailboxId, mailboxId), eq(messages.status, "sent"), gte(messages.sentAt, since)));
  return row?.count ?? 0;
}

export async function countSentToDomainLast24h(mailboxId: string, domain: string, now: Date): Promise<number> {
  const since = new Date(now.getTime() - ONE_DAY_MS);
  const [row] = await db
    .select({ count: count() })
    .from(messages)
    .innerJoin(enrollments, eq(enrollments.id, messages.enrollmentId))
    .innerJoin(contacts, eq(contacts.id, enrollments.contactId))
    .where(
      and(
        eq(enrollments.mailboxId, mailboxId),
        eq(messages.status, "sent"),
        gte(messages.sentAt, since),
        sql`lower(split_part(${contacts.email}, '@', 2)) = ${domain.toLowerCase()}`,
      ),
    );
  return row?.count ?? 0;
}
