import { NextResponse } from "next/server";
import { z } from "zod";
import { endOfPacificDay, MAX_LINE_ITEMS, MAX_SECTIONS } from "@/lib/proposals/content";
import { ProposalError, updateProposalDraft } from "@/lib/proposals/proposals";

const editSchema = z.object({
  title: z.string().max(200),
  summary: z.string().max(5000),
  sections: z.array(z.object({ heading: z.string().max(200), body: z.string().max(10000) })).max(MAX_SECTIONS),
  lineItems: z
    .array(
      z.object({
        description: z.string().max(500),
        amountUsd: z.number().int().min(0).max(10_000_000).nullable(),
        billing: z.enum(["one_time", "monthly"]),
      }),
    )
    .max(MAX_LINE_ITEMS),
  terms: z.string().max(10000),
  validUntil: z.iso.date().nullable(),
});

export async function PUT(request: Request, ctx: RouteContext<"/api/outreach/proposals/[id]">) {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  const parsed = editSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: z.flattenError(parsed.error) }, { status: 400 });

  const { validUntil, ...rest } = parsed.data;
  try {
    await updateProposalDraft(id, { ...rest, validUntil: validUntil ? endOfPacificDay(validUntil) : null });
  } catch (error) {
    if (error instanceof ProposalError) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
  return NextResponse.json({ saved: true });
}
