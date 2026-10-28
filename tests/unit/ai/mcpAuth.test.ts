/** @jest-environment node */
import { mcpEndpointUrl, mcpToken, mcpTokenMatches } from "@/lib/ai/mcpAuth";

const STRONG = "a".repeat(40);

describe("mcpAuth", () => {
  const original = process.env.MCP_ACCESS_TOKEN;
  afterEach(() => {
    process.env.MCP_ACCESS_TOKEN = original;
  });

  it("is disabled when no token or a short token is configured", () => {
    delete process.env.MCP_ACCESS_TOKEN;
    expect(mcpToken()).toBeNull();
    expect(mcpTokenMatches("")).toBe(false);
    process.env.MCP_ACCESS_TOKEN = "changeme";
    expect(mcpToken()).toBeNull();
    expect(mcpTokenMatches("changeme")).toBe(false);
  });

  it("accepts only the exact configured token", () => {
    process.env.MCP_ACCESS_TOKEN = STRONG;
    expect(mcpTokenMatches(STRONG)).toBe(true);
    expect(mcpTokenMatches(`${STRONG}x`)).toBe(false);
    expect(mcpTokenMatches("b".repeat(40))).toBe(false);
  });

  it("builds the connector URL from the site URL", () => {
    process.env.MCP_ACCESS_TOKEN = STRONG;
    expect(mcpEndpointUrl("https://app.agency.com/")).toBe(`https://app.agency.com/api/mcp/${STRONG}`);
  });
});
