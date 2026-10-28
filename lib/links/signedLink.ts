import crypto from "node:crypto";
import { loadUnsubscribeSecret } from "@/lib/outreach/unsubscribe/token";
import { siteUrl } from "@/lib/outreach/mailboxes/googleClient";

/** What a public link opens. Each purpose signs with its own derived key, so
 * a link for one can never be replayed as another (or as an unsubscribe). */
export type LinkPurpose = "proposal" | "pay" | "intake";

export function linkKey(purpose: LinkPurpose): Buffer {
  return crypto.createHmac("sha256", loadUnsubscribeSecret()).update(`leadflow:${purpose}-link`).digest();
}

function sign(payload: string, key: Buffer): string {
  return crypto.createHmac("sha256", key).update(payload).digest("base64url");
}

/** A public link token for a row. Includes the row's link version, so
 * bumping the version revokes every link handed out before. */
export function signLinkToken(id: string, linkVersion: number, key: Buffer): string {
  const payload = `${id}:${linkVersion}`;
  return `${Buffer.from(payload, "utf8").toString("base64url")}.${sign(payload, key)}`;
}

export function verifyLinkToken(token: string, key: Buffer): { id: string; linkVersion: number } | null {
  const [payloadPart, signaturePart] = token.split(".");
  if (!payloadPart || !signaturePart) return null;
  const payload = Buffer.from(payloadPart, "base64url").toString("utf8");
  const expected = Buffer.from(sign(payload, key));
  const actual = Buffer.from(signaturePart);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
  const match = payload.match(/^([0-9a-f-]{36}):(\d+)$/i);
  return match ? { id: match[1], linkVersion: Number(match[2]) } : null;
}

/** An absolute URL on this app's public address, for links sent to clients. */
export function publicUrl(path: string): string {
  return `${siteUrl().replace(/\/+$/, "")}${path}`;
}
