import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { deals } from "@/db/schema";
import { getOnboardingByIntakeToken, kickoffUrl } from "@/lib/onboarding/onboarding";
import { INTAKE_QUESTIONS } from "@/lib/onboarding/content";
import { IntakeForm } from "./IntakeForm";

/* Public intake form, keyed by the signed intake token (outside proxy.ts). */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Getting started", robots: { index: false, follow: false } };

export default async function IntakePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const onboarding = await getOnboardingByIntakeToken(token);
  if (!onboarding) {
    return (
      <main id="main-content" className="mx-auto max-w-lg px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-bold text-ink">This form is no longer available</h1>
        <p className="mt-3 text-sm text-ink-muted">Reply to our last email and we will send you a new link.</p>
      </main>
    );
  }
  const [deal] = await db.select({ title: deals.title }).from(deals).where(eq(deals.id, onboarding.dealId));

  return (
    <main id="main-content" className="px-4 py-12 sm:py-16">
      <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-surface p-6 shadow-raised sm:p-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-faint">{deal?.title}</p>
        <h1 className="mt-2 font-display text-3xl font-bold text-ink">Let&apos;s get started</h1>
        <p className="mt-2 text-sm text-ink-muted">
          A few questions so we can hit the ground running. About five minutes. You can come back and update your answers.
        </p>
        <IntakeForm
          token={token}
          questions={INTAKE_QUESTIONS}
          initialAnswers={onboarding.intakeAnswers ?? {}}
          submittedAt={onboarding.intakeSubmittedAt?.toISOString() ?? null}
          kickoffUrl={kickoffUrl()}
        />
      </div>
    </main>
  );
}
