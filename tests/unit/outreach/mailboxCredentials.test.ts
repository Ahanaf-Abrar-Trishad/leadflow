import { parseMailboxCredentials } from "@/lib/outreach/mailboxes/credentials";

describe("parseMailboxCredentials", () => {
  it("reads the new nested {smtp, imap} shape", () => {
    const stored = JSON.stringify({
      smtp: { host: "smtp.example.com", port: 587, secure: false, user: "u", pass: "p" },
      imap: { host: "imap.example.com", port: 993, secure: true, user: "u", pass: "p" },
    });
    const result = parseMailboxCredentials(stored);
    expect(result.smtp).toEqual({ host: "smtp.example.com", port: 587, secure: false, user: "u", pass: "p" });
    expect(result.imap).toEqual({ host: "imap.example.com", port: 993, secure: true, user: "u", pass: "p" });
    expect(result.oauth).toBeNull();
  });

  it("reads the old flat shape from mailboxes connected before Phase 2, with no IMAP", () => {
    const stored = JSON.stringify({ host: "smtp.example.com", port: 587, secure: false, user: "u", pass: "p" });
    const result = parseMailboxCredentials(stored);
    expect(result.smtp).toEqual({ host: "smtp.example.com", port: 587, secure: false, user: "u", pass: "p" });
    expect(result.imap).toBeNull();
    expect(result.oauth).toBeNull();
  });

  it("reads the oauth shape (Gmail-connected mailboxes)", () => {
    const stored = JSON.stringify({ oauth: { refreshToken: "1//abc", email: "jane@gmail.com" } });
    const result = parseMailboxCredentials(stored);
    expect(result.oauth).toEqual({ refreshToken: "1//abc", email: "jane@gmail.com" });
    expect(result.smtp).toBeNull();
    expect(result.imap).toBeNull();
  });
});
