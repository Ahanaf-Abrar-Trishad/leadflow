import { sql, eq } from "drizzle-orm";
import Stripe from "stripe";
import { db, queryClient } from "@/db/client";
import { aiDrafts, campaigns, contacts, deals, enrollments, events, invoices, onboardings, proposals } from "@/db/schema";
import { acceptProposal, markProposalSent, saveClaudeProposalDraft, updateProposalDraft } from "@/lib/proposals/proposals";
import { billBalance, firstOpenInvoice, getInvoiceByToken, markInvoicePaid, payUrl, voidInvoice } from "@/lib/billing/invoices";
import { createCheckoutSession, type CheckoutClient } from "@/lib/billing/stripe";
import { composeWelcome, getOnboardingForDeal, intakeUrl, listClientsNeedingWelcome } from "@/lib/onboarding/onboarding";
import { saveWelcomeDraft } from "@/lib/ai/welcome";
import { POST as webhook } from "@/app/api/stripe/webhook/route";
import { POST as submitIntakeRoute } from "@/app/api/intake/[token]/route";

const WEBHOOK_SECRET = "whsec_test_secret";

async function signedDeal(depositPercent = 50, withThread = true) {
  const [contact] = await db.insert(contacts).values({ email: "dr@brightsmile.com", fields: { company: "Bright Smile" } }).returning();
  let enrollmentId: string | undefined;
  if (withThread) {
    const [campaign] = await db.insert(campaigns).values({ name: "C", postalAddress: "1 Main St" }).returning();
    const [enrollment] = await db.insert(enrollments).values({ campaignId: campaign.id, contactId: contact.id }).returning();
    enrollmentId = enrollment.id;
  }
  const [deal] = await db.insert(deals).values({ contactId: contact.id, title: "Bright Smile Dental", stage: "call_booked", enrollmentId }).returning();
  const id = await saveClaudeProposalDraft(deal.id, {
    title: "Website refresh",
    summary: "A new site.",
    sections: [{ heading: "Plan", body: "Build it." }],
    lineItems: [
      { description: "Redesign", billing: "one_time" },
      { description: "Booking", billing: "one_time" },
      { description: "Local SEO", billing: "monthly" },
    ],
  });
  const [draft] = await db.select().from(proposals).where(eq(proposals.id, id));
  await updateProposalDraft(id, {
    ...draft,
    lineItems: [
      { description: "Redesign", amountUsd: 4200, billing: "one_time" },
      { description: "Booking", amountUsd: 900, billing: "one_time" },
      { description: "Local SEO", amountUsd: 650, billing: "monthly" },
    ],
    validUntil: new Date(Date.now() + 86_400_000),
    depositPercent,
  });
  await markProposalSent(id);
  await acceptProposal(id, { name: "Dr. Lee", email: "dr@brightsmile.com", agreed: true, ip: null, userAgent: null });
  return { deal, enrollmentId };
}

function stripeEvent(type: string, object: Record<string, unknown>) {
  const payload = JSON.stringify({ id: `evt_${Math.random()}`, object: "event", type, data: { object } });
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  return webhook(new Request("http://localhost/api/stripe/webhook", { method: "POST", body: payload, headers: { "stripe-signature": header } }));
}

describe("billing and onboarding (integration)", () => {
  const originalSecret = process.env.STRIPE_WEBHOOK_SECRET;
  beforeEach(async () => {
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    await db.execute(
      sql`TRUNCATE TABLE onboardings, invoices, proposals, deals, ai_drafts, leads, replies, messages, events, enrollments, sequence_steps, campaign_mailboxes, campaigns, mailboxes, contacts, suppressions RESTART IDENTITY CASCADE`,
    );
  });
  afterAll(async () => {
    process.env.STRIPE_WEBHOOK_SECRET = originalSecret;
    await queryClient.end({ timeout: 5 });
  });

  it("signing creates the deposit and monthly invoices from the signed snapshot", async () => {
    const { deal } = await signedDeal(50);
    const rows = await db.select().from(invoices).where(eq(invoices.dealId, deal.id));
    expect(rows.map((row) => [row.kind, row.amountCents, row.status]).sort()).toEqual([
      ["deposit", 255_000, "open"],
      ["monthly", 65_000, "open"],
    ]);
    expect((await firstOpenInvoice(deal.id))?.kind).toBe("deposit");
  });

  it("always sends the client to the one-time invoice before the monthly one, even when created in the same instant", async () => {
    const { deal } = await signedDeal(50);
    const sameInstant = new Date("2026-01-01T00:00:00Z");
    await db.update(invoices).set({ createdAt: sameInstant }).where(eq(invoices.dealId, deal.id));
    for (let i = 0; i < 5; i++) expect((await firstOpenInvoice(deal.id))?.kind).toBe("deposit");
  });

  it("a manual payment opens onboarding once, and billing the balance works exactly once", async () => {
    const { deal } = await signedDeal(50);
    const deposit = (await firstOpenInvoice(deal.id))!;
    expect(await markInvoicePaid(deposit.id, "manual", { note: "Wire Nov 3" })).toBe(true);
    expect(await markInvoicePaid(deposit.id, "manual")).toBe(false);

    const onboarding = await getOnboardingForDeal(deal.id);
    expect(onboarding?.tasks.length).toBeGreaterThan(5);
    expect((await db.select().from(events)).map((event) => event.type)).toContain("invoice_paid");

    const balance = await billBalance(deal.id);
    expect(balance.amountCents).toBe(255_000);
    await expect(billBalance(deal.id)).rejects.toThrow(/already been billed/);
  });

  it("a 100% proposal bills in full and has no balance", async () => {
    const { deal } = await signedDeal(100);
    const [full] = await db.select().from(invoices).where(eq(invoices.kind, "full"));
    expect(full.amountCents).toBe(510_000);
    await expect(billBalance(deal.id)).rejects.toThrow(/Nothing is left/);
  });

  it("pay links resolve, and voiding revokes them", async () => {
    const { deal } = await signedDeal(50);
    const deposit = (await firstOpenInvoice(deal.id))!;
    const token = payUrl(deposit).split("/pay/")[1];
    expect((await getInvoiceByToken(token))?.id).toBe(deposit.id);
    expect(await getInvoiceByToken(`${token}x`)).toBeNull();
    await voidInvoice(deposit.id);
    expect(await getInvoiceByToken(token)).toBeNull();
  });

  it("checkout charges the invoice's own amount, as a subscription for the monthly fee", async () => {
    const { deal } = await signedDeal(50);
    const rows = await db.select().from(invoices).where(eq(invoices.dealId, deal.id));
    const calls: Stripe.Checkout.SessionCreateParams[] = [];
    const fake: CheckoutClient = {
      checkout: { sessions: { create: async (params) => (calls.push(params), { id: `cs_${calls.length}`, url: "https://checkout.stripe.test/x" }) } },
    };
    for (const row of rows) await createCheckoutSession(fake, row, { success: "https://a/s", cancel: "https://a/c" }, "dr@brightsmile.com");

    const deposit = calls.find((call) => call.mode === "payment")!;
    expect(deposit.line_items?.[0].price_data).toMatchObject({ currency: "usd", unit_amount: 255_000 });
    const monthly = calls.find((call) => call.mode === "subscription")!;
    expect(monthly.line_items?.[0].price_data).toMatchObject({ unit_amount: 65_000, recurring: { interval: "month" } });
    expect(monthly.subscription_data?.metadata?.invoiceId).toBeDefined();
    const stored = await db.select({ session: invoices.stripeCheckoutSessionId }).from(invoices);
    expect(stored.every((row) => row.session?.startsWith("cs_"))).toBe(true);
  });

  it("the Stripe webhook verifies signatures and handles card and bank (ACH) payments", async () => {
    const { deal } = await signedDeal(50);
    const deposit = (await firstOpenInvoice(deal.id))!;

    const forged = await webhook(
      new Request("http://localhost", { method: "POST", body: "{}", headers: { "stripe-signature": "t=1,v1=bad" } }),
    );
    expect(forged.status).toBe(400);

    // Bank payment started: processing, not paid, no onboarding yet.
    await stripeEvent("checkout.session.completed", { id: "cs_1", object: "checkout.session", payment_status: "unpaid", metadata: { invoiceId: deposit.id } });
    expect((await db.select().from(invoices).where(eq(invoices.id, deposit.id)))[0].status).toBe("processing");
    expect(await getOnboardingForDeal(deal.id)).toBeNull();

    // ...and cleared a few days later.
    const cleared = await stripeEvent("checkout.session.async_payment_succeeded", {
      id: "cs_1",
      object: "checkout.session",
      payment_status: "paid",
      metadata: { invoiceId: deposit.id },
    });
    expect(await cleared.json()).toMatchObject({ outcome: "paid" });
    const [paid] = await db.select().from(invoices).where(eq(invoices.id, deposit.id));
    expect(paid).toMatchObject({ status: "paid", method: "stripe" });
    expect(await getOnboardingForDeal(deal.id)).not.toBeNull();

    // A card subscription records its subscription id; retries are harmless.
    const monthly = (await firstOpenInvoice(deal.id))!;
    for (let i = 0; i < 2; i++) {
      await stripeEvent("checkout.session.completed", {
        id: "cs_2",
        object: "checkout.session",
        payment_status: "paid",
        subscription: "sub_123",
        metadata: { invoiceId: monthly.id },
      });
    }
    const [sub] = await db.select().from(invoices).where(eq(invoices.id, monthly.id));
    expect(sub).toMatchObject({ status: "paid", stripeSubscriptionId: "sub_123" });
    expect((await db.select().from(events)).filter((event) => event.type === "invoice_paid")).toHaveLength(2);
  });

  it("the webhook is off without a signing secret", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const response = await webhook(new Request("http://localhost", { method: "POST", body: "{}" }));
    expect(response.status).toBe(404);
  });

  it("intake answers are stored from the public form and tick the checklist; the welcome email carries the links", async () => {
    process.env.KICKOFF_URL = "https://calendly.com/agency/kickoff";
    try {
      const { deal } = await signedDeal(50);
      await markInvoicePaid((await firstOpenInvoice(deal.id))!.id, "manual");
      const onboarding = (await getOnboardingForDeal(deal.id))!;
      const token = intakeUrl(onboarding).split("/intake/")[1];

      const post = (body: unknown, t = token) =>
        submitIntakeRoute(new Request("http://localhost", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ token: t }) });
      expect((await post({ contact_name: "Dr. Lee" })).status).toBe(400);
      expect((await post({ contact_name: "Dr. Lee", goals: "More families" }, `${token}x`)).status).toBe(404);
      expect((await post({ contact_name: "Dr. Lee", goals: "More families", password: "x" })).status).toBe(200);

      const [stored] = await db.select().from(onboardings).where(eq(onboardings.id, onboarding.id));
      expect(stored.intakeAnswers).toEqual({ contact_name: "Dr. Lee", goals: "More families" });
      expect(stored.tasks.find((task) => task.label === "Intake form submitted")?.done).toBe(true);

      const email = composeWelcome("Welcome aboard, Dr. Lee!", stored);
      expect(email).toContain(intakeUrl(stored));
      expect(email).toContain("https://calendly.com/agency/kickoff");
    } finally {
      delete process.env.KICKOFF_URL;
    }
  });

  it("Claude's welcome draft is refused with links, and offered only for unwelcomed clients with a thread", async () => {
    const { deal } = await signedDeal(50);
    await markInvoicePaid((await firstOpenInvoice(deal.id))!.id, "manual");
    expect((await listClientsNeedingWelcome(5)).map((client) => client.dealId)).toEqual([deal.id]);
    await expect(saveWelcomeDraft(deal.id, "Welcome! Book here: https://evil.example/x and fill in the form.")).rejects.toThrow(/Leave links out/);
    await saveWelcomeDraft(deal.id, "Welcome aboard! We are excited to start on your new website next week.");
    expect(await listClientsNeedingWelcome(5)).toEqual([]);
    expect((await db.select().from(aiDrafts)).map((draft) => draft.kind)).toEqual(["welcome"]);
  });
});
