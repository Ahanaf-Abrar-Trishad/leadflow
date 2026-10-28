import { NextResponse } from "next/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { suppressions } from "@/db/schema";
import { PAGE_SIZE, parsePageParam, pageOffset } from "@/lib/outreach/pagination";

const addSuppressionSchema = z.object({
  email: z.email(),
  reason: z.string().min(1),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const page = parsePageParam(url.searchParams.get("page") ?? undefined);

  const rows = await db
    .select()
    .from(suppressions)
    .orderBy(desc(suppressions.createdAt))
    .limit(PAGE_SIZE)
    .offset(pageOffset(page));

  return NextResponse.json({ suppressions: rows });
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = addSuppressionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: z.flattenError(parsed.error) }, { status: 400 });
  }

  const existing = await db.select({ id: suppressions.id }).from(suppressions).where(eq(suppressions.email, parsed.data.email));
  if (existing.length > 0) {
    return NextResponse.json({ error: "This email is already suppressed" }, { status: 409 });
  }

  const [row] = await db.insert(suppressions).values(parsed.data).returning();
  return NextResponse.json({ suppression: row }, { status: 201 });
}
