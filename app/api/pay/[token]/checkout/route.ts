import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { contacts, deals } from "@/db/schema";
import { getInvoiceByToken } from "@/lib/billing/invoices";
import { createCheckoutSession, stripeClient } from "@/lib/billing/stripe";
import { publicUrl } from "@/lib/links/signedLink";

/* Public, keyed by the signed pay token. Starts a Stripe Checkout for the
 * invoice's own amount; nothing in the request can change what is charged. */
export async function POST(_request: Request, ctx: RouteContext<"/api/pay/[token]/checkout">) {
  const { token } = await ctx.params;
  const invoice = await getInvoiceByToken(token);
  if (!invoice) return NextResponse.json({ error: "This link is no longer valid." }, { status: 404 });
  if (invoice.status !== "open") {
    return NextResponse.json({ error: "This invoice is not waiting for payment." }, { status: 409 });
  }
  const client = stripeClient();
  if (!client) return NextResponse.json({ error: "Card payments are not set up." }, { status: 503 });

  const [contact] = await db
    .select({ email: contacts.email })
    .from(deals)
    .innerJoin(contacts, eq(contacts.id, deals.contactId))
    .where(eq(deals.id, invoice.dealId));
  const page = publicUrl(`/pay/${token}`);
  const url = await createCheckoutSession(client, invoice, { success: `${page}?paid=1`, cancel: page }, contact?.email);
  return NextResponse.json({ url });
}
