import nodemailer from "nodemailer";
import type { OutboundMessage, SendResult, Transport } from "./types";

export interface SmtpCredentials {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}

export function createSmtpTransport(credentials: SmtpCredentials): Transport {
  const transporter = nodemailer.createTransport({
    host: credentials.host,
    port: credentials.port,
    secure: credentials.secure,
    auth: { user: credentials.user, pass: credentials.pass },
  });

  return {
    async verify() {
      await transporter.verify();
    },
    async send(message: OutboundMessage): Promise<SendResult> {
      const info = await transporter.sendMail({
        from: `"${message.fromName}" <${message.fromEmail}>`,
        to: message.to,
        subject: message.subject,
        text: message.text,
        inReplyTo: message.inReplyTo,
        references: message.references,
      });
      return { rfcMessageId: info.messageId };
    },
  };
}
