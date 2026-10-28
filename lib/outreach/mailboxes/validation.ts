import { z } from "zod";

export const createMailboxSchema = z.object({
  provider: z.literal("smtp"),
  fromName: z.string().min(1),
  fromEmail: z.email(),
  dailyCap: z.number().int().positive().max(500).default(15),
  smtp: z.object({
    host: z.string().min(1),
    port: z.number().int().positive(),
    secure: z.boolean(),
    user: z.string().min(1),
    pass: z.string().min(1),
  }),
  imap: z.object({
    host: z.string().min(1),
    port: z.number().int().positive(),
    secure: z.boolean(),
  }),
});

export type CreateMailboxInput = z.infer<typeof createMailboxSchema>;
