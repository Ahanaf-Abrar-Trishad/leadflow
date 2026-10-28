import { assertPublicWebHost, type AddressLookup } from "@/lib/outreach/mailboxes/hostGuard";
import type { FetchLike } from "./gmaps/client";
import { cleanEmail, websiteDomain } from "./normalize";

const EMAIL_IN_TEXT = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
/** Where small-business sites keep their address, homepage first. */
const CONTACT_PATHS = ["/", "/contact", "/contact-us", "/about", "/about-us"];
const MAX_REDIRECTS = 3;
const MAX_BYTES = 1_000_000;
const TIMEOUT_MS = 10_000;

/** Every usable address in a page, own-domain addresses first: a site often
 * also shows its web designer's or a plugin vendor's address. */
export function extractEmails(html: string, siteDomain: string | undefined): string[] {
  const found = new Set<string>();
  for (const match of html.matchAll(EMAIL_IN_TEXT)) {
    const email = cleanEmail(match[0]);
    if (email) found.add(email);
  }
  const all = [...found];
  if (!siteDomain) return all;
  const own = all.filter((email) => email.endsWith(`@${siteDomain}`) || email.endsWith(`.${siteDomain}`));
  return [...own, ...all.filter((email) => !own.includes(email))];
}

export interface PageFetcherOptions {
  fetchImpl?: FetchLike;
  lookup?: AddressLookup;
}

/**
 * GETs a page from a lead's website. Every hop, redirects included, must
 * resolve to a public address on port 80/443: the URL came from a scrape,
 * so it must never become a way to reach this server's own network.
 */
export async function fetchPublicPage(url: string, options: PageFetcherOptions = {}): Promise<string | null> {
  const fetchImpl = options.fetchImpl ?? fetch;
  let current = new URL(url);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (current.protocol !== "http:" && current.protocol !== "https:") return null;
    const port = current.port ? Number(current.port) : current.protocol === "https:" ? 443 : 80;
    try {
      await assertPublicWebHost(current.hostname.replace(/^\[|\]$/g, ""), port, options.lookup);
    } catch {
      return null;
    }

    let response: Response;
    try {
      response = await fetchImpl(current.href, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; LeadFlow/0.1)", Accept: "text/html" },
      });
    } catch {
      return null;
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return null;
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) return null;
    const type = response.headers.get("content-type") ?? "";
    if (type && !type.includes("html") && !type.includes("text")) return null;
    return readCapped(response);
  }
  return null;
}

async function readCapped(response: Response): Promise<string> {
  if (!response.body) return response.text();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  while (bytes < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    text += decoder.decode(value, { stream: true });
  }
  await reader.cancel().catch(() => undefined);
  return text;
}

/** Visits the homepage, then the usual contact/about pages, and returns the
 * best address found - or undefined when the site lists none. */
export async function findWebsiteEmail(website: string, options: PageFetcherOptions = {}): Promise<string | undefined> {
  const base = new URL(website);
  const domain = websiteDomain(website);
  for (const path of CONTACT_PATHS) {
    const html = await fetchPublicPage(new URL(path, base).href, options);
    if (!html) continue;
    const [best] = extractEmails(html, domain);
    if (best) return best;
  }
  return undefined;
}
