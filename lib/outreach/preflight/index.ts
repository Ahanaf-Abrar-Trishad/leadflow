import { checkSpf, checkDmarc, checkDkimAny, COMMON_DKIM_SELECTORS, type DnsCheckResult, type TxtResolver } from "./dns";
import { findUnresolvedContacts, type TemplateContact, type UnresolvedContact } from "./templateCheck";

export interface PreflightInput {
  senderDomain: string;
  /** Tried in order; DKIM passes on the first that has a record. */
  dkimSelectors: string[];
  postalAddress: string;
  templates: string[];
  contacts: TemplateContact[];
  /** Skip the SPF/DKIM/DMARC DNS lookups for this domain - used for a
   * Gmail-OAuth-connected mailbox's domain, where Google's own sending
   * infrastructure authenticates the mail and there's no DNS record for
   * the caller to configure or for this to discover. */
  skipDnsChecks?: boolean;
}

export interface PreflightResult {
  pass: boolean;
  checks: DnsCheckResult[];
  unresolvedContacts: UnresolvedContact[];
  hasPostalAddress: boolean;
}

export async function runPreflight(input: PreflightInput, resolveTxt?: TxtResolver): Promise<PreflightResult> {
  const checks = input.skipDnsChecks
    ? []
    : await Promise.all([
        checkSpf(input.senderDomain, resolveTxt),
        checkDmarc(input.senderDomain, resolveTxt),
        checkDkimAny(input.senderDomain, input.dkimSelectors, resolveTxt),
      ]);

  const unresolvedContacts = findUnresolvedContacts(input.templates, input.contacts);
  const hasPostalAddress = input.postalAddress.trim().length > 0;

  return {
    pass: checks.every((c) => c.pass) && unresolvedContacts.length === 0 && hasPostalAddress,
    checks,
    unresolvedContacts,
    hasPostalAddress,
  };
}

/** DKIM_SELECTOR (comma-separated) first, then the common providers' ones. */
export function dkimSelectors(): string[] {
  const configured = (process.env.DKIM_SELECTOR ?? "")
    .split(",")
    .map((selector) => selector.trim())
    .filter(Boolean);
  return [...new Set([...configured, ...COMMON_DKIM_SELECTORS])];
}
