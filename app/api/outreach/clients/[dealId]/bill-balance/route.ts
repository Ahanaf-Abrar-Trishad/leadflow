import { NextResponse } from "next/server";
import { z } from "zod";
import { billBalance, InvoiceError } from "@/lib/billing/invoices";

/** The work is done: bill what is left of the one-time total. */
export async function POST(_request: Request, ctx: RouteContext<"/api/outreach/clients/[dealId]/bill-balance">) {
  const { dealId } = await ctx.params;
  if (!z.uuid().safeParse(dealId).success) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  try {
    const invoice = await billBalance(dealId);
    return NextResponse.json({ invoiceId: invoice.id }, { status: 201 });
  } catch (error) {
    if (error instanceof InvoiceError) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
}
