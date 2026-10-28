import { createMailboxSchema } from "@/lib/outreach/mailboxes/validation";

describe("createMailboxSchema", () => {
  const valid = {
    provider: "smtp" as const,
    fromName: "Jane",
    fromEmail: "jane@example.com",
    smtp: { host: "smtp.example.com", port: 587, secure: false, user: "jane", pass: "app-password" },
    imap: { host: "imap.example.com", port: 993, secure: true },
  };

  it("accepts a valid payload and fills in the default daily cap", () => {
    const result = createMailboxSchema.parse(valid);
    expect(result.dailyCap).toBe(15);
  });

  it("rejects an invalid email address", () => {
    expect(createMailboxSchema.safeParse({ ...valid, fromEmail: "not-an-email" }).success).toBe(false);
  });

  it("rejects a non-integer port", () => {
    const result = createMailboxSchema.safeParse({ ...valid, smtp: { ...valid.smtp, port: 587.5 } });
    expect(result.success).toBe(false);
  });
});
