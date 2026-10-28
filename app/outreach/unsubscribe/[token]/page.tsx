import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { enrollments, contacts, suppressions } from "@/db/schema";
import { loadUnsubscribeSecret, verifyUnsubscribeToken } from "@/lib/outreach/unsubscribe/token";
import { CheckIcon, InfoIcon } from "@/components/shared/icons";

// Never cache: this page performs a write (suppressing the contact) on every
// visit, and must never serve a stale/prerendered response to a recipient.
export const dynamic = "force-dynamic";

async function unsubscribe(token: string): Promise<boolean> {
  const secret = loadUnsubscribeSecret();
  const enrollmentId = verifyUnsubscribeToken(token, secret);
  if (!enrollmentId) return false;

  const [enrollment] = await db
    .select({ contactId: enrollments.contactId })
    .from(enrollments)
    .where(eq(enrollments.id, enrollmentId));
  if (!enrollment) return false;

  const [contact] = await db.select({ email: contacts.email }).from(contacts).where(eq(contacts.id, enrollment.contactId));
  if (contact) {
    await db.insert(suppressions).values({ email: contact.email, reason: "unsubscribed" }).onConflictDoNothing();
  }
  await db.update(enrollments).set({ status: "unsubscribed" }).where(eq(enrollments.id, enrollmentId));
  return true;
}

export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const success = await unsubscribe(token);

  return (
    // The only page in this product a recipient ever sees, so it gets to look
    // finished rather than like a bare confirmation string.
    <main
      id="main-content"
      tabIndex={-1}
      className="ambient-wash mx-auto max-w-lg px-4 py-20 text-center outline-none sm:px-6"
    >
      <span
        aria-hidden="true"
        className={`mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border shadow-raised ${
          success ? "border-signal/25 bg-signal-soft text-signal" : "border-border bg-surface text-ink-faint"
        }`}
      >
        {success ? <CheckIcon className="h-5 w-5" /> : <InfoIcon className="h-5 w-5" />}
      </span>

      <h1 className="mt-5 font-display text-2xl font-bold tracking-[-0.01em] text-ink">
        {success ? "You're unsubscribed" : "This link is no longer valid"}
      </h1>
      <p className="mx-auto mt-3 max-w-prose text-sm leading-relaxed text-ink-muted">
        {success
          ? "You won't receive any further messages in this sequence. Nothing else is required from you."
          : "This unsubscribe link has already been used, or it was altered in transit. If you're still receiving messages, replying to any of them will stop the sequence."}
      </p>
    </main>
  );
}
