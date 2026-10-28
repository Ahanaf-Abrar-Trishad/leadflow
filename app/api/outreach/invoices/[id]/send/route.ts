import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { deals } from "@/db/schema";
import { getInvoice, payUrl } from "@/lib/billing/invoices";
import { sendThreadReply, ThreadSendError } from "@/lib/outreach/replies/send";

const schema = z.object({ message: z.string().trim().min(1).max(3000) });

/** Emails the invoice's pay link in the client's conversation thread. */
export async function POST(request: Request, ctx: RouteContext<"/api/outreach/invoices/[id]/send">) {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: z.flattenError(parsed.error) }, { status: 400 });

  const invoice = await getInvoice(id);
  if (!invoice || invoice.status !== "open") return NextResponse.json({ error: "This invoice is not waiting for payment." }, { status: 409 });
  const [deal] = await db.select({ enrollmentId: deals.enrollmentId }).from(deals).where(eq(deals.id, invoice.dealId));
  if (!deal?.enrollmentId) {
    return NextResponse.json({ error: "This client has no email conversation. Copy the link instead." }, { status: 422 });
  }
  try {
    await sendThreadReply(deal.enrollmentId, `${parsed.data.message}\n\n${payUrl(invoice)}`);
  } catch (error) {
    if (error instanceof ThreadSendError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
  return NextResponse.json({ sent: true });
}
