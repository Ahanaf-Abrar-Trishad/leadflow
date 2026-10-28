import dns from "node:dns/promises";
import net from "node:net";

/** Standard SMTP submission/relay ports. Anything else is refused, since
 * there is no legitimate reason for this app to open arbitrary ports. */
const ALLOWED_SMTP_PORTS = new Set([25, 465, 587, 2525]);
/** Standard IMAP ports: 143 (plaintext/STARTTLS) and 993 (implicit TLS). */
const ALLOWED_IMAP_PORTS = new Set([143, 993]);

export type AddressLookup = (host: string) => Promise<{ address: string; family: 4 | 6 }[]>;

function isPrivateOrReservedIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return true; // malformed -> unsafe
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a >= 224) return true; // multicast (224+) and reserved (240+)
  return false;
}

function isPrivateOrReservedIPv6(rawIp: string): boolean {
  const ip = rawIp.toLowerCase();
  if (ip === "::1" || ip === "::") return true; // loopback / unspecified
  if (/^fe[89ab][0-9a-f]:/.test(ip)) return true; // fe80::/10 link-local
  if (/^f[cd][0-9a-f]{2}:/.test(ip)) return true; // fc00::/7 unique local
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped && net.isIPv4(mapped[1])) return isPrivateOrReservedIPv4(mapped[1]);
  return false;
}

async function defaultLookup(host: string): ReturnType<AddressLookup> {
  const results = await dns.lookup(host, { all: true });
  return results.map(({ address, family }) => ({ address, family: family as 4 | 6 }));
}

/**
 * Throws unless `host:port` is safe for this server to open an outbound
 * connection to: a real, resolvable, public (non-private/loopback/
 * link-local) address, on one of `allowedPorts`. Shared core for both the
 * SMTP and IMAP guards - prevents mailbox-connect being used as an SSRF
 * probe against internal infrastructure (including cloud metadata
 * endpoints), regardless of which protocol's port set applies.
 */
async function assertPublicHost(
  host: string,
  port: number,
  allowedPorts: Set<number>,
  lookup: AddressLookup = defaultLookup,
): Promise<void> {
  if (!allowedPorts.has(port)) {
    throw new Error(`Port ${port} is not an allowed port.`);
  }

  const family = net.isIP(host);
  const addresses = family !== 0 ? [{ address: host, family: family as 4 | 6 }] : await lookup(host);

  if (addresses.length === 0) {
    throw new Error(`Could not resolve host "${host}".`);
  }

  for (const address of addresses) {
    const unsafe =
      address.family === 4 ? isPrivateOrReservedIPv4(address.address) : isPrivateOrReservedIPv6(address.address);
    if (unsafe) {
      throw new Error(`Host "${host}" resolves to a private or reserved address and is not allowed.`);
    }
  }
}

export async function assertPublicSmtpHost(
  host: string,
  port: number,
  lookup: AddressLookup = defaultLookup,
): Promise<void> {
  return assertPublicHost(host, port, ALLOWED_SMTP_PORTS, lookup);
}

export async function assertPublicImapHost(
  host: string,
  port: number,
  lookup: AddressLookup = defaultLookup,
): Promise<void> {
  return assertPublicHost(host, port, ALLOWED_IMAP_PORTS, lookup);
}
