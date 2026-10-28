import { NextResponse } from "next/server";
import { z } from "zod";
import { InvoiceError, voidInvoice } from "@/lib/billing/invoices";

export async function POST(_request: Request, ctx: RouteContext<"/api/outreach/invoices/[id]/void">) {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  try {
    await voidInvoice(id);
  } catch (error) {
    if (error instanceof InvoiceError) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
  return NextResponse.json({ voided: true });
}
