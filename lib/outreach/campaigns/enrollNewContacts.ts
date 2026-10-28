import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { campaignMailboxes, contacts, enrollments, mailboxes, sequenceSteps } from "@/db/schema";
import { runPoolPreflight, summarizePoolDomains, type PoolPreflightResult } from "@/lib/outreach/preflight/pool";
import { scheduleCampaignStart, type PoolMailbox, type ScheduledEnrollment } from "@/lib/outreach/campaigns/start";
import { countSentByMailboxToday } from "@/lib/outreach/scheduler/sendCounts";

export interface CampaignForScheduling {
  id: string;
  postalAddress: string;
  baseIntervalSeconds: number;
  businessHoursStart: number;
  businessHoursEnd: number;
  businessDays: number[];
  domainThrottleLimit: number;
}

export interface EnrollmentPlan {
  scheduled: ScheduledEnrollment[];
  skippedReason?: "no_healthy_mailboxes" | "no_sequence_steps" | "no_pending_contacts" | "preflight_failed";
  preflight?: PoolPreflightResult;
}

/**
 * Computes which of a campaign's currently-pending enrollments should be
 * scheduled and onto which pool mailbox, WITHOUT writing anything - the
 * caller applies the plan inside its own `runAtomic` block, alongside
 * whatever else it needs to do atomically (the initial campaign-start
 * route also flips `campaigns.status` to "active" in that same
 * transaction; a later contacts-import into an already-active campaign
 * does not need to touch campaign status at all). Splitting "compute the
 * plan" from "commit the plan" this way means both callers keep the exact
 * atomicity they need instead of sharing one write path that would have to
 * compromise between them.
 */
export async function planCampaignEnrollment(campaign: CampaignForScheduling): Promise<EnrollmentPlan> {
  const pool = await db
    .select({
      id: mailboxes.id,
      provider: mailboxes.provider,
      fromEmail: mailboxes.fromEmail,
      dailyCap: mailboxes.dailyCap,
      rampStartedAt: mailboxes.rampStartedAt,
      health: mailboxes.health,
    })
    .from(campaignMailboxes)
    .innerJoin(mailboxes, eq(mailboxes.id, campaignMailboxes.mailboxId))
    .where(eq(campaignMailboxes.campaignId, campaign.id));

  const healthyPool = pool.filter((m) => m.health === "healthy");
  if (healthyPool.length === 0) return { scheduled: [], skippedReason: "no_healthy_mailboxes" };

  const steps = await db
    .select({ subjectTemplate: sequenceSteps.subjectTemplate, bodyTemplate: sequenceSteps.bodyTemplate })
    .from(sequenceSteps)
    .where(eq(sequenceSteps.campaignId, campaign.id))
    .orderBy(asc(sequenceSteps.stepOrder));

  if (steps.length === 0) return { scheduled: [], skippedReason: "no_sequence_steps" };

  const pending = await db
    .select({
      enrollmentId: enrollments.id,
      contactId: contacts.id,
      email: contacts.email,
      fields: contacts.fields,
      timezone: contacts.timezone,
    })
    .from(enrollments)
    .innerJoin(contacts, eq(contacts.id, enrollments.contactId))
    .where(and(eq(enrollments.campaignId, campaign.id), eq(enrollments.status, "pending")));

  if (pending.length === 0) return { scheduled: [], skippedReason: "no_pending_contacts" };

  const { senderDomains, trustedDomains } = summarizePoolDomains(healthyPool);
  const preflight = await runPoolPreflight({
    senderDomains,
    trustedDomains,
    dkimSelector: "hostingermail1",
    postalAddress: campaign.postalAddress,
    templates: steps.flatMap((step) => [step.subjectTemplate, step.bodyTemplate]),
    // unsubscribe_token is synthesized by the worker at send time (see
    // worker/tick.ts) - it's never stored on a contact, so a placeholder
    // is supplied here purely so the merge-field check doesn't flag every
    // contact as missing a field that will always resolve by send time.
    contacts: pending.map((p) => ({
      id: p.contactId,
      email: p.email,
      fields: { ...p.fields, unsubscribe_token: "placeholder" },
    })),
  });

  if (!preflight.pass) return { scheduled: [], skippedReason: "preflight_failed", preflight };

  const now = new Date();
  const mailboxesForScheduling: PoolMailbox[] = await Promise.all(
    healthyPool.map(async (m) => ({
      id: m.id,
      dailyCap: m.dailyCap,
      rampStartedAt: m.rampStartedAt,
      alreadySentToday: await countSentByMailboxToday(m.id, now),
    })),
  );

  const scheduled = scheduleCampaignStart({
    now,
    baseIntervalSeconds: campaign.baseIntervalSeconds,
    businessHours: {
      startHour: campaign.businessHoursStart,
      endHour: campaign.businessHoursEnd,
      days: campaign.businessDays,
    },
    mailboxes: mailboxesForScheduling,
    domainThrottleLimit: campaign.domainThrottleLimit,
    enrollments: pending.map((p) => ({ id: p.enrollmentId, email: p.email, timezone: p.timezone })),
  });

  return { scheduled };
}
