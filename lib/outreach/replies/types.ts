/** Shared types + pure helpers for the Replies feature, kept out of
 * queries.ts specifically so client components can import them without
 * pulling in `db` (queries.ts imports `@/db/client`, which drags Postgres's
 * Node-only `net`/`tls` dependencies into the client bundle). */

export type ReplyFilter = "unhandled" | "all";

export interface ReplyThread {
  enrollmentId: string;
  contactEmail: string;
  campaignId: string;
  campaignName: string;
  currentStep: number;
  /** The latest reply's own status - a fresh inbound message always lands as
   * "unhandled" even if earlier replies on the same thread were handled, so
   * this naturally reopens a thread without any extra bookkeeping. */
  status: string;
  snoozedUntil: Date | null;
  subject: string;
  snippet: string;
  unsubscribeRequested: boolean;
  createdAt: Date;
}

export interface ThreadMessage {
  id: string;
  direction: "in" | "out";
  at: Date;
  subject: string;
  text: string;
}

/** True once a thread needs an operator's attention again - either a fresh
 * unhandled reply, or a snooze whose date has passed. */
export function threadNeedsAttention(thread: Pick<ReplyThread, "status" | "snoozedUntil">, now: Date = new Date()): boolean {
  if (thread.status === "unhandled") return true;
  return thread.status === "snoozed" && !!thread.snoozedUntil && thread.snoozedUntil <= now;
}
