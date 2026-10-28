import { NextResponse } from "next/server";
import { z } from "zod";
import { detectFormat, mapRows } from "@/lib/leads/mapping";
import { upsertLeads } from "@/lib/leads/upsert";

const importLeadsSchema = z.object({
  headers: z.array(z.string()).min(1),
  rows: z.array(z.record(z.string(), z.string())).min(1).max(5000),
  format: z.enum(["auto", "gmaps", "scout", "generic"]).default("auto"),
});

/** Source recorded on the lead for each recognized file format. */
const SOURCE_BY_FORMAT = { gmaps: "gmaps", scout: "scout", generic: "csv" } as const;

export async function POST(request: Request) {
  const parsed = importLeadsSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: z.flattenError(parsed.error) }, { status: 400 });
  }
  const { headers, rows } = parsed.data;
  const format = parsed.data.format === "auto" ? detectFormat(headers) : parsed.data.format;

  const { leads, skipped } = mapRows(format, headers, rows);
  const result = await upsertLeads(leads, { source: SOURCE_BY_FORMAT[format] });

  return NextResponse.json({ format, added: result.added, merged: result.updated, skipped });
}
