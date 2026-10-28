import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { deals, onboardings } from "@/db/schema";
import { composeWelcome, markWelcomeSent } from "@/lib/onboarding/onboarding";
import { markWelcomeDraftSent } from "@/lib/ai/welcome";
import { sendThreadReply, ThreadSendError } from "@/lib/outreach/replies/send";

const schema = z.object({ text: z.string().trim().min(10).max(5000), draftId: z.uuid().optional() });

/** Sends the welcome email the operator approved, with the intake and kickoff
 * links appended by LeadFlow. */
export async function POST(request: Request, ctx: RouteContext<"/api/outreach/onboardings/[id]/welcome">) {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Onboarding not found" }, { status: 404 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: z.flattenError(parsed.error) }, { status: 400 });

  const [row] = await db
    .select({ onboarding: onboardings, enrollmentId: deals.enrollmentId })
    .from(onboardings)
    .innerJoin(deals, eq(deals.id, onboardings.dealId))
    .where(eq(onboardings.id, id));
  if (!row) return NextResponse.json({ error: "Onboarding not found" }, { status: 404 });
  if (!row.enrollmentId) {
    return NextResponse.json({ error: "This client has no email conversation to send in." }, { status: 422 });
  }
  try {
    await sendThreadReply(row.enrollmentId, composeWelcome(parsed.data.text, row.onboarding));
  } catch (error) {
    if (error instanceof ThreadSendError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
  await markWelcomeSent(id);
  if (parsed.data.draftId) await markWelcomeDraftSent(parsed.data.draftId, row.enrollmentId, parsed.data.text);
  return NextResponse.json({ sent: true });
}
