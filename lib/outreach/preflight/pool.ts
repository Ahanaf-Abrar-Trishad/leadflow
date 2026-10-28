import { runPreflight, type PreflightInput, type PreflightResult } from "./index";
import type { TxtResolver } from "./dns";

export interface PoolPreflightInput extends Omit<PreflightInput, "senderDomain" | "skipDnsChecks"> {
  /** Distinct sender domains across a campaign's mailbox pool - the
   * caller is responsible for deduping (most pools share one domain). */
  senderDomains: string[];
  /** Domains to skip SPF/DKIM/DMARC lookups for - domains used
   * exclusively by Gmail-OAuth-connected mailboxes, where Google's own
   * sending infrastructure authenticates the mail and there's no DNS
   * record for the caller to configure or for this to discover. */
  trustedDomains?: string[];
}

export interface PoolPreflightResult {
  pass: boolean;
  perDomain: { domain: string; result: PreflightResult }[];
}

/**
 * Runs the existing single-domain preflight once per distinct sender
 * domain in a campaign's mailbox pool - a non-compliant pool member can't
 * quietly ride along on another mailbox's clean DNS record.
 */
export async function runPoolPreflight(input: PoolPreflightInput, resolveTxt?: TxtResolver): Promise<PoolPreflightResult> {
  const { senderDomains, trustedDomains = [], ...rest } = input;
  const trusted = new Set(trustedDomains);

  const perDomain = await Promise.all(
    senderDomains.map(async (domain) => ({
      domain,
      result: await runPreflight({ ...rest, senderDomain: domain, skipDnsChecks: trusted.has(domain) }, resolveTxt),
    })),
  );

  return { pass: perDomain.every((d) => d.result.pass), perDomain };
}

export interface PoolMailboxSummary {
  fromEmail: string;
  provider: string;
}

/**
 * Splits a pool's mailboxes into every distinct sender domain, plus the
 * subset of those domains used exclusively by Gmail-OAuth-connected
 * mailboxes - safe to pass as `trustedDomains` above, since Google's own
 * infrastructure authenticates mail sent through the Gmail API and there's
 * no DNS record on that domain for a self-hosted SPF/DKIM/DMARC check to
 * find. A domain shared with even one non-gmail_oauth mailbox still gets
 * checked, since that mailbox's mail isn't Google-authenticated.
 */
export function summarizePoolDomains(pool: PoolMailboxSummary[]): { senderDomains: string[]; trustedDomains: string[] } {
  const domainProviders = new Map<string, Set<string>>();
  for (const mailbox of pool) {
    const domain = mailbox.fromEmail.split("@")[1] ?? "";
    if (!domainProviders.has(domain)) domainProviders.set(domain, new Set());
    domainProviders.get(domain)!.add(mailbox.provider);
  }

  const senderDomains = [...domainProviders.keys()];
  const trustedDomains = senderDomains.filter((domain) => {
    const providers = domainProviders.get(domain)!;
    return providers.size === 1 && providers.has("gmail_oauth");
  });

  return { senderDomains, trustedDomains };
}
