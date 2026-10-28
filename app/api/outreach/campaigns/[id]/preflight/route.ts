import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { campaigns, campaignMailboxes, mailboxes, contacts, enrollments, sequenceSteps } from "@/db/schema";
import { runPoolPreflight, summarizePoolDomains } from "@/lib/outreach/preflight/pool";

export async function GET(_request: Request, ctx: RouteContext<"/api/outreach/campaigns/[id]/preflight">) {
  const { id } = await ctx.params;

  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id));
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const pool = await db
    .select({ fromEmail: mailboxes.fromEmail, provider: mailboxes.provider })
    .from(campaignMailboxes)
    .innerJoin(mailboxes, eq(mailboxes.id, campaignMailboxes.mailboxId))
    .where(eq(campaignMailboxes.campaignId, id));
  if (pool.length === 0) return NextResponse.json({ error: "Campaign has no mailboxes" }, { status: 422 });

  const steps = await db
    .select({ subjectTemplate: sequenceSteps.subjectTemplate, bodyTemplate: sequenceSteps.bodyTemplate })
    .from(sequenceSteps)
    .where(eq(sequenceSteps.campaignId, id))
    .orderBy(asc(sequenceSteps.stepOrder));

  const enrolledContacts = await db
    .select({ id: contacts.id, email: contacts.email, fields: contacts.fields })
    .from(contacts)
    .innerJoin(enrollments, eq(enrollments.contactId, contacts.id))
    .where(eq(enrollments.campaignId, id));

  const { senderDomains, trustedDomains } = summarizePoolDomains(pool);
  const result = await runPoolPreflight({
    senderDomains,
    trustedDomains,
    dkimSelector: "hostingermail1",
    postalAddress: campaign.postalAddress,
    templates: steps.flatMap((step) => [step.subjectTemplate, step.bodyTemplate]),
    // unsubscribe_token is synthesized by the worker at send time (see
    // worker/tick.ts) - it's never stored on a contact, so a placeholder
    // is supplied here purely so the merge-field check doesn't flag every
    // contact as missing a field that will always resolve by send time.
    contacts: enrolledContacts.map((c) => ({ ...c, fields: { ...c.fields, unsubscribe_token: "placeholder" } })),
  });

  return NextResponse.json(result);
}
