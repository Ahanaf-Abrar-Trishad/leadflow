const DSN_SENDER_PATTERN = /^(mailer-daemon|postmaster)@/i;
const DSN_CONTENT_TYPE_PATTERN = /report-type=delivery-status/i;
const STATUS_FIELD_PATTERN = /^Status:\s*(\d\.\d+\.\d+)/im;

/** A message is treated as a delivery-status notification (bounce report)
 * if it comes from a conventional bounce-handling address, or if its raw
 * source declares the RFC 3464 delivery-status report content type. */
export function isDsnMessage(from: string, source: string): boolean {
  return DSN_SENDER_PATTERN.test(from) || DSN_CONTENT_TYPE_PATTERN.test(source);
}

/** Pulls the SMTP enhanced status code (e.g. "5.1.1") out of a raw DSN
 * message body, per RFC 3464's `Status:` field. */
export function extractStatusCode(source: string): string | null {
  const match = source.match(STATUS_FIELD_PATTERN);
  return match ? match[1] : null;
}

/** 5.x.x = permanent failure (act on it). 4.x.x = transient (nothing to do
 * - a single-attempt send has no retry to trigger). Anything else is
 * treated conservatively as unknown, not acted on. */
export function classifyStatusCode(code: string | null): "hard" | "soft" | "unknown" {
  if (!code) return "unknown";
  if (code.startsWith("5.")) return "hard";
  if (code.startsWith("4.")) return "soft";
  return "unknown";
}
