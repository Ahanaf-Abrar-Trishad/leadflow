import type { SmtpCredentials } from "@/lib/outreach/transport/smtp";

export interface ImapCredentials {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}

export interface GoogleOAuthCredentials {
  refreshToken: string;
  email: string;
}

export interface MailboxCredentials {
  smtp: SmtpCredentials | null;
  imap: ImapCredentials | null;
  oauth: GoogleOAuthCredentials | null;
}

/**
 * Reads a decrypted mailbox credential payload in any of three shapes:
 * the oauth shape `{oauth: {...}}` (Gmail-connected, Phase 3+), the nested
 * `{smtp, imap}` shape (Phase 2+), or the old flat `{host, port, secure,
 * user, pass}` shape (Phase 1 mailboxes, connected before IMAP or OAuth
 * existed - keeps sending mail via SMTP, just with `imap`/`oauth: null`
 * until reconnected).
 */
export function parseMailboxCredentials(decrypted: string): MailboxCredentials {
  const parsed = JSON.parse(decrypted) as Record<string, unknown>;

  if ("oauth" in parsed) {
    return { smtp: null, imap: null, oauth: parsed.oauth as GoogleOAuthCredentials };
  }
  if ("smtp" in parsed) {
    return {
      smtp: parsed.smtp as SmtpCredentials,
      imap: (parsed.imap as ImapCredentials | undefined) ?? null,
      oauth: null,
    };
  }

  return { smtp: parsed as unknown as SmtpCredentials, imap: null, oauth: null };
}
