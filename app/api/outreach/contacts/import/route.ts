import { NextResponse } from "next/server";
import { z } from "zod";
import { importContactsSchema } from "@/lib/outreach/contacts/importSchema";
import { validateContactRows } from "@/lib/outreach/contacts/validateRows";
import { importContactsIntoCampaign } from "@/lib/outreach/contacts/importIntoCampaign";

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = importContactsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: z.flattenError(parsed.error) }, { status: 400 });
  }
  const { campaignId, emailColumn, fieldMapping, rows } = parsed.data;

  const { valid, invalid } = validateContactRows(rows, emailColumn, fieldMapping);
  const { imported, skippedSuppressed, schedulingWarning } = await importContactsIntoCampaign(campaignId, valid);

  return NextResponse.json({ imported, invalidRows: invalid, skippedSuppressed, schedulingWarning });
}
