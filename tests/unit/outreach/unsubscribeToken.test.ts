import crypto from "node:crypto";
import { signUnsubscribeToken, verifyUnsubscribeToken } from "@/lib/outreach/unsubscribe/token";

describe("unsubscribe token", () => {
  const secret = crypto.randomBytes(32);
  const ENROLLMENT_ID = "11111111-1111-1111-1111-111111111111";

  it("verifies a token it just signed", () => {
    const token = signUnsubscribeToken(ENROLLMENT_ID, secret);
    expect(verifyUnsubscribeToken(token, secret)).toBe(ENROLLMENT_ID);
  });

  it("rejects a token signed with a different secret", () => {
    const token = signUnsubscribeToken(ENROLLMENT_ID, secret);
    expect(verifyUnsubscribeToken(token, crypto.randomBytes(32))).toBeNull();
  });

  it("rejects a malformed token", () => {
    expect(verifyUnsubscribeToken("not-a-real-token", secret)).toBeNull();
  });

  it("rejects a token with a tampered signature", () => {
    const token = signUnsubscribeToken(ENROLLMENT_ID, secret);
    const [id] = token.split(".");
    expect(verifyUnsubscribeToken(`${id}.tamperedSignature`, secret)).toBeNull();
  });
});
