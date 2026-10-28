import { google, type gmail_v1 } from "googleapis";
import { createGoogleRefreshClient } from "@/lib/outreach/mailboxes/googleClient";
import type { GoogleOAuthCredentials } from "@/lib/outreach/mailboxes/credentials";
import type { InboxMessage } from "./imap";

export interface GmailPollResult {
  messages: InboxMessage[];
  newHistoryId: string | null;
}

export interface GmailPollClient {
  verify(): Promise<void>;
  fetchNew(lastHistoryId: string | null, since: Date): Promise<GmailPollResult>;
}

export function createGmailPollClient(credentials: GoogleOAuthCredentials): GmailPollClient {
  const client = createGoogleRefreshClient(credentials);
  const gmail = google.gmail({ version: "v1", auth: client });

  return {
    async verify() {
      await gmail.users.getProfile({ userId: "me" });
    },

    async fetchNew(lastHistoryId, since) {
      if (lastHistoryId) {
        try {
          return await fetchViaHistory(gmail, lastHistoryId);
        } catch (error) {
          // historyId outside Gmail's ~7-day retention window - fall back
          // to the date-filtered listing path below, same as a
          // never-polled mailbox.
          if (!isHistoryNotFoundError(error)) throw error;
        }
      }
      return fetchViaMessageList(gmail, since);
    },
  };
}

async function fetchViaHistory(gmail: gmail_v1.Gmail, startHistoryId: string): Promise<GmailPollResult> {
  const response = await gmail.users.history.list({ userId: "me", startHistoryId, historyTypes: ["messageAdded"] });

  const newHistoryId = response.data.historyId ?? startHistoryId;
  const messageIds = new Set<string>();
  for (const entry of response.data.history ?? []) {
    for (const added of entry.messagesAdded ?? []) {
      const msg = added.message;
      if (msg?.id && msg.labelIds?.includes("INBOX")) messageIds.add(msg.id);
    }
  }

  const messages = await fetchMessages(gmail, [...messageIds]);
  return { messages, newHistoryId };
}

async function fetchViaMessageList(gmail: gmail_v1.Gmail, since: Date): Promise<GmailPollResult> {
  const afterSeconds = Math.floor(since.getTime() / 1000);
  const list = await gmail.users.messages.list({ userId: "me", labelIds: ["INBOX"], q: `after:${afterSeconds}` });

  const messageIds = (list.data.messages ?? []).map((m) => m.id).filter((id): id is string => Boolean(id));
  const messages = await fetchMessages(gmail, messageIds);

  const profile = await gmail.users.getProfile({ userId: "me" });
  return { messages, newHistoryId: profile.data.historyId ?? null };
}

async function fetchMessages(gmail: gmail_v1.Gmail, ids: string[]): Promise<InboxMessage[]> {
  const results: InboxMessage[] = [];
  for (const id of ids) {
    const response = await gmail.users.messages.get({ userId: "me", id, format: "raw" });
    if (!response.data.raw) continue;
    const source = Buffer.from(response.data.raw, "base64url").toString("utf8");
    const fromMatch = source.match(/^From:.*?<?([^\s<>]+@[^\s<>]+)>?\s*$/im);
    results.push({ from: (fromMatch?.[1] ?? "").toLowerCase(), source });
  }
  return results;
}

function isHistoryNotFoundError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const err = error as { code?: unknown; response?: { status?: unknown } };
  return err.code === 404 || err.code === "404" || err.response?.status === 404;
}
