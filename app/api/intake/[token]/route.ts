import { NextResponse } from "next/server";
import { getOnboardingByIntakeToken, OnboardingError, submitIntake } from "@/lib/onboarding/onboarding";

/* Public, keyed by the signed intake token. Only the known questions are
 * stored (lib/onboarding/content.ts), trimmed and length-capped. */
export async function POST(request: Request, ctx: RouteContext<"/api/intake/[token]">) {
  const { token } = await ctx.params;
  const onboarding = await getOnboardingByIntakeToken(token);
  if (!onboarding) return NextResponse.json({ error: "This form is no longer available." }, { status: 404 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid form." }, { status: 400 });
  try {
    await submitIntake(onboarding.id, body as Record<string, unknown>);
  } catch (error) {
    if (error instanceof OnboardingError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
  return NextResponse.json({ submitted: true });
}
