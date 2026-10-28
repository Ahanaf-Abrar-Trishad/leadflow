import { promises as dns } from "node:dns";

export interface DnsCheckResult {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
}

export type TxtResolver = (hostname: string) => Promise<string[][]>;

export async function checkSpf(domain: string, resolveTxt: TxtResolver = dns.resolveTxt): Promise<DnsCheckResult> {
  try {
    const records = (await resolveTxt(domain)).map((r) => r.join(""));
    const spf = records.find((r) => r.startsWith("v=spf1"));
    return spf
      ? { id: "spf", label: "SPF record", pass: true, detail: spf }
      : {
          id: "spf",
          label: "SPF record",
          pass: false,
          detail: `No SPF TXT record found on ${domain}. Add a TXT record starting with "v=spf1".`,
        };
  } catch {
    return { id: "spf", label: "SPF record", pass: false, detail: `Could not resolve TXT records for ${domain}.` };
  }
}

export async function checkDmarc(domain: string, resolveTxt: TxtResolver = dns.resolveTxt): Promise<DnsCheckResult> {
  const target = `_dmarc.${domain}`;
  try {
    const records = (await resolveTxt(target)).map((r) => r.join(""));
    const dmarc = records.find((r) => r.startsWith("v=DMARC1"));
    return dmarc
      ? { id: "dmarc", label: "DMARC record", pass: true, detail: dmarc }
      : {
          id: "dmarc",
          label: "DMARC record",
          pass: false,
          detail: `No DMARC TXT record found at ${target}. Add a TXT record starting with "v=DMARC1".`,
        };
  } catch {
    return { id: "dmarc", label: "DMARC record", pass: false, detail: `Could not resolve TXT records for ${target}.` };
  }
}

export async function checkDkim(
  domain: string,
  selector: string,
  resolveTxt: TxtResolver = dns.resolveTxt,
): Promise<DnsCheckResult> {
  const target = `${selector}._domainkey.${domain}`;
  try {
    const records = (await resolveTxt(target)).map((r) => r.join(""));
    const dkim = records.find((r) => r.includes("v=DKIM1"));
    return dkim
      ? { id: "dkim", label: "DKIM record", pass: true, detail: dkim }
      : { id: "dkim", label: "DKIM record", pass: false, detail: `No DKIM TXT record found at ${target}.` };
  } catch {
    return {
      id: "dkim",
      label: "DKIM record",
      pass: false,
      detail: `Could not resolve TXT records for ${target}. Check the selector "${selector}" is correct.`,
    };
  }
}

/** Selectors the common mail providers publish DKIM under: Google Workspace,
 * Microsoft 365, Zoho, Hostinger, and the usual cPanel/generic names. */
export const COMMON_DKIM_SELECTORS = [
  "google",
  "selector1",
  "selector2",
  "zoho",
  "zmail",
  "hostingermail1",
  "default",
  "dkim",
  "mail",
  "k1",
  "s1",
  "s2",
];

/**
 * DKIM passes if any of the selectors has a record. A domain's selector
 * depends on its mail provider, and there is no DNS query that lists them,
 * so the check tries the configured ones first and then the common ones.
 */
export async function checkDkimAny(
  domain: string,
  selectors: string[],
  resolveTxt: TxtResolver = dns.resolveTxt,
): Promise<DnsCheckResult> {
  for (const selector of selectors) {
    const result = await checkDkim(domain, selector, resolveTxt);
    if (result.pass) return { ...result, detail: `${selector}: ${result.detail}` };
  }
  return {
    id: "dkim",
    label: "DKIM record",
    pass: false,
    detail: `No DKIM record found for ${domain} under the selectors ${selectors.join(", ")}. Set DKIM_SELECTOR to your provider's selector if it uses another one.`,
  };
}
