/**
 * @jest-environment node
 *
 * mailparser's stream-based parser calls setImmediate, which jsdom (this
 * suite's default test environment) doesn't provide - the real poller runs
 * as a plain Node process, so this only affects the test environment.
 */
import { parseInboundMessage } from "@/lib/outreach/replies/parseInboundMessage";

function rawMessage(body: string, subject = "Re: Quick question"): string {
  return [
    "From: Jane Doe <jane@acme.com>",
    "To: ops@dgency.co",
    `Subject: ${subject}`,
    "Message-ID: <abc123@acme.com>",
    "Content-Type: text/plain; charset=utf-8",
    "",
    body,
  ].join("\r\n");
}

describe("parseInboundMessage", () => {
  it("extracts subject, body text, a truncated snippet, and the message id", async () => {
    const result = await parseInboundMessage(rawMessage("Thanks for reaching out, tell me more."));

    expect(result.subject).toBe("Re: Quick question");
    expect(result.bodyText).toBe("Thanks for reaching out, tell me more.");
    expect(result.snippet).toBe("Thanks for reaching out, tell me more.");
    expect(result.rfcMessageId).toBe("<abc123@acme.com>");
    expect(result.unsubscribeRequested).toBe(false);
  });

  it("truncates a long body to a snippet", async () => {
    const long = "word ".repeat(80).trim();
    const result = await parseInboundMessage(rawMessage(long));

    expect(result.snippet.length).toBeLessThanOrEqual(160);
    expect(result.bodyText.length).toBeGreaterThan(result.snippet.length);
  });

  it("flags an unsubscribe request", async () => {
    const result = await parseInboundMessage(rawMessage("Please unsubscribe me from this list."));
    expect(result.unsubscribeRequested).toBe(true);
  });

  it("does not flag an ordinary reply", async () => {
    const result = await parseInboundMessage(rawMessage("Sounds interesting, send me a deck."));
    expect(result.unsubscribeRequested).toBe(false);
  });
});
