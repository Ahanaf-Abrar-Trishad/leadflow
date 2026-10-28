import { assertPublicSmtpHost, assertPublicImapHost } from "@/lib/outreach/mailboxes/hostGuard";

const fakeLookup = (map: Record<string, { address: string; family: 4 | 6 }[]>) => {
  return async (host: string) => map[host] ?? [];
};

describe("assertPublicSmtpHost", () => {
  it("rejects a port outside the SMTP allowlist", async () => {
    await expect(assertPublicSmtpHost("mail.example.com", 8080, fakeLookup({}))).rejects.toThrow(/port/i);
  });

  it("allows a public IPv4 address on an allowed port", async () => {
    const lookup = fakeLookup({ "mail.example.com": [{ address: "203.0.113.10", family: 4 }] });
    await expect(assertPublicSmtpHost("mail.example.com", 587, lookup)).resolves.toBeUndefined();
  });

  it("rejects loopback (127.0.0.1)", async () => {
    const lookup = fakeLookup({ localhost: [{ address: "127.0.0.1", family: 4 }] });
    await expect(assertPublicSmtpHost("localhost", 587, lookup)).rejects.toThrow(/private or reserved/i);
  });

  it("rejects link-local / cloud metadata (169.254.169.254)", async () => {
    const lookup = fakeLookup({ evil: [{ address: "169.254.169.254", family: 4 }] });
    await expect(assertPublicSmtpHost("evil", 587, lookup)).rejects.toThrow(/private or reserved/i);
  });

  it("rejects RFC1918 private ranges (10.x, 172.16-31.x, 192.168.x)", async () => {
    const lookup = fakeLookup({
      a: [{ address: "10.0.0.5", family: 4 }],
      b: [{ address: "172.20.0.5", family: 4 }],
      c: [{ address: "192.168.1.5", family: 4 }],
    });
    await expect(assertPublicSmtpHost("a", 587, lookup)).rejects.toThrow();
    await expect(assertPublicSmtpHost("b", 587, lookup)).rejects.toThrow();
    await expect(assertPublicSmtpHost("c", 587, lookup)).rejects.toThrow();
  });

  it("rejects IPv6 loopback and unique-local addresses", async () => {
    const lookup = fakeLookup({
      a: [{ address: "::1", family: 6 }],
      b: [{ address: "fd12:3456:789a::1", family: 6 }],
    });
    await expect(assertPublicSmtpHost("a", 587, lookup)).rejects.toThrow();
    await expect(assertPublicSmtpHost("b", 587, lookup)).rejects.toThrow();
  });

  it("rejects a host that fails to resolve", async () => {
    await expect(assertPublicSmtpHost("nowhere.invalid", 587, fakeLookup({}))).rejects.toThrow(/resolve/i);
  });

  it("allows a literal public IP passed directly as the host", async () => {
    await expect(assertPublicSmtpHost("203.0.113.10", 587, fakeLookup({}))).resolves.toBeUndefined();
  });

  it("rejects a literal private IP passed directly as the host", async () => {
    await expect(assertPublicSmtpHost("127.0.0.1", 587, fakeLookup({}))).rejects.toThrow();
  });
});

describe("assertPublicImapHost", () => {
  it("allows the standard IMAP ports (143, 993)", async () => {
    const lookup = fakeLookup({ "imap.example.com": [{ address: "203.0.113.10", family: 4 }] });
    await expect(assertPublicImapHost("imap.example.com", 993, lookup)).resolves.toBeUndefined();
    await expect(assertPublicImapHost("imap.example.com", 143, lookup)).resolves.toBeUndefined();
  });

  it("rejects a port outside the IMAP allowlist, including SMTP's own ports", async () => {
    const lookup = fakeLookup({ "imap.example.com": [{ address: "203.0.113.10", family: 4 }] });
    await expect(assertPublicImapHost("imap.example.com", 587, lookup)).rejects.toThrow(/port/i);
  });

  it("rejects a private address the same way SMTP does", async () => {
    const lookup = fakeLookup({ localhost: [{ address: "127.0.0.1", family: 4 }] });
    await expect(assertPublicImapHost("localhost", 993, lookup)).rejects.toThrow(/private or reserved/i);
  });
});
