import { z } from "zod";

export const importContactsSchema = z.object({
  campaignId: z.uuid(),
  emailColumn: z.string().min(1),
  fieldMapping: z.record(z.string(), z.string()).optional(),
  rows: z.array(z.record(z.string(), z.string())).min(1).max(5000),
});

export type ImportContactsInput = z.infer<typeof importContactsSchema>;
