import crypto from "node:crypto";

export function loadUnsubscribeSecret(envVar = "UNSUBSCRIBE_SECRET"): Buffer {
  const value = process.env[envVar];
  if (!value) {
    throw new Error(
      `${envVar} is not set. Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
    );
  }
  return Buffer.from(value, "base64");
}

export function signUnsubscribeToken(enrollmentId: string, secret: Buffer): string {
  const signature = crypto.createHmac("sha256", secret).update(enrollmentId).digest("base64url");
  return `${Buffer.from(enrollmentId, "utf8").toString("base64url")}.${signature}`;
}

export function verifyUnsubscribeToken(token: string, secret: Buffer): string | null {
  const [idPart, signaturePart] = token.split(".");
  if (!idPart || !signaturePart) return null;

  const enrollmentId = Buffer.from(idPart, "base64url").toString("utf8");

  const expected = crypto.createHmac("sha256", secret).update(enrollmentId).digest("base64url");
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signaturePart);
  if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
    return null;
  }
  return enrollmentId;
}
