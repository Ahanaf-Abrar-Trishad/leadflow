import { createHash, timingSafeEqual } from "node:crypto";

/** Shorter tokens are refused outright, so a placeholder like "changeme" can
 * never open the endpoint. */
export const MCP_TOKEN_MIN_LENGTH = 32;

/** The configured MCP access token, or null when the endpoint is disabled. */
export function mcpToken(): string | null {
  const token = process.env.MCP_ACCESS_TOKEN?.trim();
  return token && token.length >= MCP_TOKEN_MIN_LENGTH ? token : null;
}

/** Constant-time comparison; hashing first makes the lengths equal. */
export function mcpTokenMatches(candidate: string): boolean {
  const expected = mcpToken();
  if (!expected) return false;
  const a = createHash("sha256").update(candidate).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** The URL to paste into Claude, or null when no token is configured. */
export function mcpEndpointUrl(siteUrl: string): string | null {
  const token = mcpToken();
  return token ? `${siteUrl.replace(/\/+$/, "")}/api/mcp/${token}` : null;
}
