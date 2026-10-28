import { z } from "zod";

export const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

export type CredentialsInput = z.infer<typeof credentialsSchema>;
