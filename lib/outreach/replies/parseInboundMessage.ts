import { simpleParser } from "mailparser";

/** Not a sentiment classifier - just enough keyword matching to flag a
 * thread as an opt-out request worth prioritizing in the Replies inbox. */
const UNSUBSCRIBE_KEYWORDS = [
  /unsubscribe/i,
  /remove me/i,
  /take me off/i,
  /stop (emailing|contacting|messaging)/i,
  /opt[\s-]?out/i,
];

const SNIPPET_LENGTH = 160;

export interface ParsedInboundMessage {
  subject: string;
  bodyText: string;
  snippet: string;
  rfcMessageId: string | null;
  unsubscribeRequested: boolean;
}

/** Extracts the fields the Replies inbox needs from a raw RFC822 message -
 * both transport layers (lib/outreach/transport/imap.ts, gmailPoll.ts)
 * already hand back the full source, this just parses it. */
export async function parseInboundMessage(source: string): Promise<ParsedInboundMessage> {
  const parsed = await simpleParser(source);
  const bodyText = (parsed.text ?? "").trim();
  const snippet = bodyText.replace(/\s+/g, " ").slice(0, SNIPPET_LENGTH);

  return {
    subject: parsed.subject ?? "",
    bodyText,
    snippet,
    rfcMessageId: parsed.messageId ?? null,
    unsubscribeRequested: UNSUBSCRIBE_KEYWORDS.some((pattern) => pattern.test(bodyText)),
  };
}
