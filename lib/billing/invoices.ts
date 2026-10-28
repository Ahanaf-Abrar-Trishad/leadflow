import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { events, invoices, proposals, type ProposalSnapshot } from "@/db/schema";
import { linkKey, publicUrl, signLinkToken, verifyLinkToken } from "@/lib/links/signedLink";
import { balanceUsd, invoicesForSignedProposal } from "./plan";
import { startOnboarding } from "@/lib/onboarding/onboarding";

export class InvoiceError extends Error {}

export type InvoiceRow = typeof invoices.$inferSelect;

type Executor = Pick<typeof db, "insert" | "select" | "update">;

/** Called inside the acceptance transaction, so a signature never exists
 * without its invoices. */
export async function createInvoicesForAcceptance(
  tx: Executor,
  proposalId: string,
  dealId: string,
  snapshot: ProposalSnapshot,
): Promise<void> {
  const rows = invoicesForSignedProposal(snapshot);
  if (rows.length === 0) return;
  await tx.insert(invoices).values(rows.map((row) => ({ ...row, dealId, proposalId })));
}

/** Bills what is left of the one-time total after the deposit, once. */
export async function billBalance(dealId: string): Promise<InvoiceRow> {
  const [proposal] = await db
    .select()
    .from(proposals)
    .where(and(eq(proposals.dealId, dealId), eq(proposals.status, "accepted")));
  if (!proposal?.signedSnapshot) throw new InvoiceError("This client has no accepted proposal to bill from.");
  const existing = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.proposalId, proposal.id), eq(invoices.kind, "balance"), inArray(invoices.status, ["open", "processing", "paid"])));
  if (existing.length > 0) throw new InvoiceError("The balance has already been billed.");

  const snapshot = proposal.signedSnapshot;
  const balance = balanceUsd(snapshot);
  if (balance <= 0) throw new InvoiceError("Nothing is left to bill: the one-time total was due up front.");

  const [created] = await db
    .insert(invoices)
    .values({
      dealId,
      proposalId: proposal.id,
      kind: "balance",
      description: `${snapshot.title} - balance`,
      amountCents: balance * 100,
    })
    .returning();
  return created;
}

/** One-time money (deposit, full, balance) before the monthly fee: invoices
 * created together share a timestamp, and the client must be sent to the
 * deposit first, never to a subscription. */
const ONE_TIME_FIRST = sql`case when ${invoices.kind} = 'monthly' then 1 else 0 end`;

export function payUrl(invoice: Pick<InvoiceRow, "id" | "linkVersion">): string {
  return publicUrl(`/pay/${signLinkToken(invoice.id, invoice.linkVersion, linkKey("pay"))}`);
}

export async function getInvoice(id: string): Promise<InvoiceRow | null> {
  const [row] = await db.select().from(invoices).where(eq(invoices.id, id));
  return row ?? null;
}

/** Resolves a pay link; null for a forged or revoked link or a void invoice. */
export async function getInvoiceByToken(token: string): Promise<InvoiceRow | null> {
  const parsed = verifyLinkToken(token, linkKey("pay"));
  if (!parsed) return null;
  const invoice = await getInvoice(parsed.id);
  if (!invoice || invoice.linkVersion !== parsed.linkVersion || invoice.status === "void") return null;
  return invoice;
}

export async function listInvoicesForDeal(dealId: string): Promise<InvoiceRow[]> {
  return db.select().from(invoices).where(eq(invoices.dealId, dealId)).orderBy(asc(invoices.createdAt), ONE_TIME_FIRST);
}

/** The first invoice still waiting for money - what the client is sent to
 * pay right after signing. */
export async function firstOpenInvoice(dealId: string): Promise<InvoiceRow | null> {
  const [row] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.dealId, dealId), eq(invoices.status, "open")))
    .orderBy(ONE_TIME_FIRST, asc(invoices.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * Records a payment (idempotent: paying a paid invoice is a no-op) and opens
 * onboarding on the client's first payment. `method` is "stripe" from the
 * webhook, "manual" when the operator marks it.
 */
export async function markInvoicePaid(
  id: string,
  method: "stripe" | "manual",
  extra: { note?: string; stripeSubscriptionId?: string | null } = {},
): Promise<boolean> {
  const now = new Date();
  const updated = await db
    .update(invoices)
    .set({
      status: "paid",
      method,
      paidAt: now,
      ...(extra.note ? { note: extra.note.slice(0, 500) } : {}),
      ...(extra.stripeSubscriptionId ? { stripeSubscriptionId: extra.stripeSubscriptionId } : {}),
      updatedAt: now,
    })
    .where(and(eq(invoices.id, id), inArray(invoices.status, ["open", "processing"])))
    .returning({ dealId: invoices.dealId, amountCents: invoices.amountCents });
  if (updated.length === 0) return false;

  await db.insert(events).values({ type: "invoice_paid", payload: { invoiceId: id, method, amountCents: updated[0].amountCents } });
  await startOnboarding(updated[0].dealId);
  return true;
}

export async function setInvoiceStatus(id: string, status: "open" | "processing", note?: string): Promise<void> {
  await db
    .update(invoices)
    .set({ status, ...(note ? { note } : {}), updatedAt: new Date() })
    .where(and(eq(invoices.id, id), inArray(invoices.status, ["open", "processing"])));
}

/** Cancels an unpaid invoice and revokes its pay link. */
export async function voidInvoice(id: string): Promise<void> {
  const updated = await db
    .update(invoices)
    .set({ status: "void", linkVersion: sql`${invoices.linkVersion} + 1`, updatedAt: new Date() })
    .where(and(eq(invoices.id, id), inArray(invoices.status, ["open", "processing"])))
    .returning({ id: invoices.id });
  if (updated.length === 0) throw new InvoiceError("Only an unpaid invoice can be voided.");
}

export async function attachCheckoutSession(id: string, sessionId: string): Promise<void> {
  await db.update(invoices).set({ stripeCheckoutSessionId: sessionId, updatedAt: new Date() }).where(eq(invoices.id, id));
}
