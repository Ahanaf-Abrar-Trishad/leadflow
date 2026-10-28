export interface OutboundMessage {
  to: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  text: string;
  inReplyTo?: string;
  references?: string[];
  threadId?: string; // Gmail-specific: the provider thread to reply into, if known. Ignored by the SMTP transport.
}

export interface SendResult {
  rfcMessageId: string;
  providerThreadId?: string; // Gmail-specific: populated only by the Gmail transport.
}

export interface Transport {
  verify(): Promise<void>;
  send(message: OutboundMessage): Promise<SendResult>;
}
