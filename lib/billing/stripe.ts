import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { invoices } from "@/db/schema";
import { attachCheckoutSession, markInvoicePaid, setInvoiceStatus, type InvoiceRow } from "./invoices";

/** The slice of the Stripe client LeadFlow uses, so tests can pass a fake. */
export interface CheckoutClient {
  checkout: {
    sessions: {
      create(params: Stripe.Checkout.SessionCreateParams): Promise<Pick<Stripe.Checkout.Session, "id" | "url">>;
    };
  };
}

/** Null when Stripe is not configured; the pay page then shows the manual
 * payment instructions only. */
export function stripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  return key ? new Stripe(key) : null;
}

export function stripeEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

/**
 * A Stripe Checkout session for one invoice: a one-time payment, or a monthly
 * subscription for a "monthly" invoice. The invoice id rides along in
 * metadata so the webhook can find it; prices are the invoice's own amount,
 * never anything from the request.
 */
export async function createCheckoutSession(
  client: CheckoutClient,
  invoice: InvoiceRow,
  urls: { success: string; cancel: string },
  customerEmail?: string,
): Promise<string> {
  const isMonthly = invoice.kind === "monthly";
  const session = await client.checkout.sessions.create({
    mode: isMonthly ? "subscription" : "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: invoice.amountCents,
          product_data: { name: invoice.description },
          ...(isMonthly ? { recurring: { interval: "month" as const } } : {}),
        },
      },
    ],
    metadata: { invoiceId: invoice.id },
    ...(isMonthly ? { subscription_data: { metadata: { invoiceId: invoice.id } } } : {}),
    ...(customerEmail ? { customer_email: customerEmail } : {}),
    success_url: urls.success,
    cancel_url: urls.cancel,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  await attachCheckoutSession(invoice.id, session.id);
  return session.url;
}

async function invoiceIdFor(session: Stripe.Checkout.Session): Promise<string | null> {
  const fromMetadata = session.metadata?.invoiceId;
  if (fromMetadata) return fromMetadata;
  const [row] = await db.select({ id: invoices.id }).from(invoices).where(eq(invoices.stripeCheckoutSessionId, session.id));
  return row?.id ?? null;
}

function subscriptionId(session: Stripe.Checkout.Session): string | null {
  if (!session.subscription) return null;
  return typeof session.subscription === "string" ? session.subscription : session.subscription.id;
}

/**
 * Applies a verified Stripe event. Card payments complete at checkout; bank
 * payments (ACH) complete days later through the async events, so a
 * completed-but-unpaid session only moves the invoice to "processing".
 * Every branch is idempotent - Stripe retries deliveries.
 */
export async function handleStripeEvent(event: Stripe.Event): Promise<"paid" | "processing" | "failed" | "ignored"> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const invoiceId = await invoiceIdFor(session);
      if (!invoiceId) return "ignored";
      if (session.payment_status === "paid" || session.payment_status === "no_payment_required") {
        await markInvoicePaid(invoiceId, "stripe", { stripeSubscriptionId: subscriptionId(session) });
        return "paid";
      }
      await setInvoiceStatus(invoiceId, "processing", "Bank payment started; waiting for it to clear.");
      return "processing";
    }
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object;
      const invoiceId = await invoiceIdFor(session);
      if (!invoiceId) return "ignored";
      await markInvoicePaid(invoiceId, "stripe", { stripeSubscriptionId: subscriptionId(session) });
      return "paid";
    }
    case "checkout.session.async_payment_failed": {
      const session = event.data.object;
      const invoiceId = await invoiceIdFor(session);
      if (!invoiceId) return "ignored";
      await setInvoiceStatus(invoiceId, "open", "The bank payment failed. The client can try again from the same link.");
      return "failed";
    }
    default:
      return "ignored";
  }
}
