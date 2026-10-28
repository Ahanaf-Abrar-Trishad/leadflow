import crypto from "node:crypto";
import { loadUnsubscribeSecret } from "@/lib/outreach/unsubscribe/token";

/** A key of its own, derived from the existing secret, so a proposal link can
 * never be replayed as an unsubscribe link or the other way round. */
function proposalKey(): Buffer {
  return crypto.createHmac("sha256", loadUnsubscribeSecret()).update("leadflow:proposal-link").digest();
}

function sign(payload: string, key: Buffer): string {
  return crypto.createHmac("sha256", key).update(payload).digest("base64url");
}

/** The public link token for a proposal. Includes the link version, so
 * bumping it (withdraw, back to draft) revokes every earlier link. */
export function signProposalToken(proposalId: string, linkVersion: number, key: Buffer = proposalKey()): string {
  const payload = `${proposalId}:${linkVersion}`;
  return `${Buffer.from(payload, "utf8").toString("base64url")}.${sign(payload, key)}`;
}

export function verifyProposalToken(
  token: string,
  key: Buffer = proposalKey(),
): { proposalId: string; linkVersion: number } | null {
  const [payloadPart, signaturePart] = token.split(".");
  if (!payloadPart || !signaturePart) return null;
  const payload = Buffer.from(payloadPart, "base64url").toString("utf8");
  const expected = Buffer.from(sign(payload, key));
  const actual = Buffer.from(signaturePart);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
  const match = payload.match(/^([0-9a-f-]{36}):(\d+)$/i);
  return match ? { proposalId: match[1], linkVersion: Number(match[2]) } : null;
}
