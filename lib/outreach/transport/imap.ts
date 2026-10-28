import { ImapFlow } from "imapflow";
import type { ImapCredentials } from "@/lib/outreach/mailboxes/credentials";

export interface InboxMessage {
  from: string;
  source: string;
}

export interface ImapClient {
  verify(): Promise<void>;
  fetchSince(date: Date): Promise<InboxMessage[]>;
}

function buildFlow(credentials: ImapCredentials): ImapFlow {
  return new ImapFlow({
    host: credentials.host,
    port: credentials.port,
    secure: credentials.secure,
    auth: { user: credentials.user, pass: credentials.pass },
    logger: false,
  });
}

export function createImapClient(credentials: ImapCredentials): ImapClient {
  return {
    async verify() {
      const client = buildFlow(credentials);
      await client.connect();
      await client.logout();
    },

    async fetchSince(date: Date): Promise<InboxMessage[]> {
      const client = buildFlow(credentials);
      await client.connect();
      const lock = await client.getMailboxLock("INBOX");
      try {
        const uids = await client.search({ since: date }, { uid: true });
        if (!uids || uids.length === 0) return [];

        const messages = await client.fetchAll(uids, { envelope: true, source: true }, { uid: true });
        return messages.map((message) => ({
          from: message.envelope?.from?.[0]?.address?.toLowerCase() ?? "",
          source: message.source?.toString("utf8") ?? "",
        }));
      } finally {
        lock.release();
        await client.logout();
      }
    },
  };
}
