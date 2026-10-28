import { credentialsSchema } from "@/lib/outreach/auth/validation";

describe("credentialsSchema", () => {
  it("accepts a valid email and an 8+ character password", () => {
    const result = credentialsSchema.safeParse({ email: "jane@example.com", password: "long-enough" });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid email", () => {
    expect(credentialsSchema.safeParse({ email: "not-an-email", password: "long-enough" }).success).toBe(false);
  });

  it("rejects a password shorter than 8 characters", () => {
    expect(credentialsSchema.safeParse({ email: "jane@example.com", password: "short" }).success).toBe(false);
  });
});
