import { google } from "googleapis";
import MailComposer from "nodemailer/lib/mail-composer";
import { createGoogleRefreshClient } from "@/lib/outreach/mailboxes/googleClient";
import type { GoogleOAuthCredentials } from "@/lib/outreach/mailboxes/credentials";
import type { OutboundMessage, SendResult, Transport } from "./types";

function toBase64Url(buffer: Buffer): string {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function createGmailTransport(credentials: GoogleOAuthCredentials): Transport {
  const client = createGoogleRefreshClient(credentials);
  const gmail = google.gmail({ version: "v1", auth: client });

  return {
    async verify() {
      await gmail.users.getProfile({ userId: "me" });
    },

    async send(message: OutboundMessage): Promise<SendResult> {
      const composer = new MailComposer({
        from: `"${message.fromName}" <${message.fromEmail}>`,
        to: message.to,
        subject: message.subject,
        text: message.text,
        inReplyTo: message.inReplyTo,
        references: message.references,
      });
      // Read back the Message-ID MailComposer generates (rather than
      // supplying our own) so the value we return is guaranteed to be the
      // exact one actually written into the built MIME - no separate
      // generation-and-hope-they-match step.
      const node = composer.compile();
      const messageId = node.messageId();
      const built = await node.build();

      const response = await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw: toBase64Url(built), threadId: message.threadId },
      });

      return { rfcMessageId: messageId, providerThreadId: response.data.threadId ?? undefined };
    },
  };
}
