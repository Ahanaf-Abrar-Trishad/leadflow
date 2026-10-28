import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { contacts, deals } from "@/db/schema";
import { PageShell, PageHeader } from "@/components/outreach/PageShell";
import { listInvoicesForDeal, payUrl } from "@/lib/billing/invoices";
import { getOnboardingForDeal, intakeUrl, kickoffUrl } from "@/lib/onboarding/onboarding";
import { INTAKE_QUESTIONS } from "@/lib/onboarding/content";
import { getPendingWelcomeDraft } from "@/lib/ai/welcome";
import { stripeEnabled } from "@/lib/billing/stripe";
import { InvoicesPanel } from "./InvoicesPanel";
import { OnboardingPanel } from "./OnboardingPanel";

export const metadata = { title: "Client | LeadFlow" };
export const dynamic = "force-dynamic";

export default async function ClientPage({ params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(dealId)) notFound();
  const [deal] = await db
    .select({ id: deals.id, title: deals.title, stage: deals.stage, enrollmentId: deals.enrollmentId, email: contacts.email, fields: contacts.fields })
    .from(deals)
    .innerJoin(contacts, eq(contacts.id, deals.contactId))
    .where(eq(deals.id, dealId));
  if (!deal) notFound();

  const [invoiceRows, onboarding] = await Promise.all([listInvoicesForDeal(dealId), getOnboardingForDeal(dealId)]);
  const welcomeDraft = onboarding && deal.enrollmentId ? await getPendingWelcomeDraft(deal.enrollmentId) : null;
  const firstName = deal.fields.first_name || deal.fields.greeting || "there";

  return (
    <PageShell>
      <PageHeader back={{ href: "/outreach/clients", label: "Clients" }} title={deal.title} description={deal.email} />
      <div className="flex flex-col gap-6">
        <InvoicesPanel
          dealId={dealId}
          canEmail={Boolean(deal.enrollmentId)}
          stripe={stripeEnabled()}
          invoices={invoiceRows.map((invoice) => ({
            id: invoice.id,
            kind: invoice.kind,
            description: invoice.description,
            amountCents: invoice.amountCents,
            status: invoice.status,
            method: invoice.method,
            note: invoice.note,
            paidAt: invoice.paidAt?.toISOString() ?? null,
            url: invoice.status === "void" ? null : payUrl(invoice),
          }))}
          defaultMessage={`Hi ${firstName},\n\nHere is the invoice for the next step. You can pay it securely here:`}
        />
        <OnboardingPanel
          dealId={dealId}
          canEmail={Boolean(deal.enrollmentId)}
          kickoffConfigured={Boolean(kickoffUrl())}
          onboarding={
            onboarding && {
              id: onboarding.id,
              tasks: onboarding.tasks,
              intakeUrl: intakeUrl(onboarding),
              intakeAnswers: onboarding.intakeAnswers,
              intakeSubmittedAt: onboarding.intakeSubmittedAt?.toISOString() ?? null,
              welcomeSentAt: onboarding.welcomeSentAt?.toISOString() ?? null,
            }
          }
          questions={INTAKE_QUESTIONS.map(({ key, label }) => ({ key, label }))}
          welcomeDraft={welcomeDraft}
          defaultWelcome={`Hi ${firstName},\n\nWelcome aboard, and thank you for choosing us! We are excited to get started.\n\nTo hit the ground running, please fill in the short getting-started form below and pick a time for our kickoff call. If anything comes up in the meantime, just reply to this email.\n\nBest,`}
        />
      </div>
    </PageShell>
  );
}
