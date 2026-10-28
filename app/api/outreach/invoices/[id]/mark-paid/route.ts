import { NextResponse } from "next/server";
import { z } from "zod";
import { markInvoicePaid } from "@/lib/billing/invoices";

const schema = z.object({ note: z.string().max(500).default("") });

/** For money that arrived outside Stripe: wire, Zelle, check. */
export async function POST(request: Request, ctx: RouteContext<"/api/outreach/invoices/[id]/mark-paid">) {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: z.flattenError(parsed.error) }, { status: 400 });
  const changed = await markInvoicePaid(id, "manual", { note: parsed.data.note || undefined });
  if (!changed) return NextResponse.json({ error: "This invoice is not waiting for payment." }, { status: 409 });
  return NextResponse.json({ paid: true });
}
