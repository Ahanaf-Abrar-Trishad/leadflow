export function isDomainThrottled(sentToDomainLast24h: number, limit: number): boolean {
  return sentToDomainLast24h >= limit;
}

export function extractDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at === -1 ? "" : email.slice(at + 1).toLowerCase();
}
