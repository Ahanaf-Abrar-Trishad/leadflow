import { z } from "zod";

export const sequenceStepSchema = z.object({
  subjectTemplate: z.string().min(1),
  bodyTemplate: z.string().min(1),
  delayDays: z.number().int().min(0).default(0),
});

export const createCampaignSchema = z.object({
  mailboxIds: z.array(z.uuid()).min(1),
  name: z.string().min(1),
  steps: z.array(sequenceStepSchema).min(1).max(5),
  postalAddress: z.string().min(1),
  baseIntervalSeconds: z.number().int().positive().default(60),
  businessHoursStart: z.number().int().min(0).max(23).default(9),
  businessHoursEnd: z.number().int().min(1).max(24).default(16),
  businessDays: z.array(z.number().int().min(0).max(6)).default([2, 3, 4]),
  domainThrottleLimit: z.number().int().positive().default(3),
});

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type SequenceStepInput = z.infer<typeof sequenceStepSchema>;
