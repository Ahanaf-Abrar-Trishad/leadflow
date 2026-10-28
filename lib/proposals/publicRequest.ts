/** The client's IP for the signature record. Behind the reverse proxy the
 * README requires, the first X-Forwarded-For entry is the real client. */
export function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || null;
}
