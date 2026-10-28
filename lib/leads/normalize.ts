/** The shape every lead source (Google Maps, Scout, a generic CSV) is mapped
 * into before it is stored. Only `name` is required; everything else is
 * whatever the source happened to know. */
export interface LeadInput {
  name: string;
  /** The source's own stable id (a Maps place_id, a Scout platform:username).
   * Only used for deduplication when there is no website or email. */
  externalId?: string;
  contactName?: string;
  category?: string;
  email?: string;
  emailSource?: string;
  phone?: string;
  website?: string;
  address?: string;
  timezone?: string;
  rating?: number;
  reviewCount?: number;
  platform?: string;
  profileUrl?: string;
  followers?: number;
  socials?: Record<string, string>;
}

const EMAIL_PATTERN = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

/** Placeholder and asset-host domains that turn up in scraped page text but
 * are never a real business inbox. */
const JUNK_EMAIL_DOMAINS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "domain.com",
  "yourdomain.com",
  "email.com",
  "sentry.io",
  "wixpress.com",
  "sentry-next.wixpress.com",
  "godaddy.com",
]);

const ASSET_SUFFIXES = [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"];

/** Hosts many unrelated businesses share as their "website" - a domain match
 * on these says nothing about two leads being the same business. */
const SHARED_HOSTS = new Set([
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "twitter.com",
  "x.com",
  "tiktok.com",
  "youtube.com",
  "linktr.ee",
  "google.com",
  "sites.google.com",
  "business.site",
  "yelp.com",
  "wixsite.com",
]);

/** Returns the first usable address in `raw`, lowercased, or undefined.
 * Scrapers often return several addresses in one cell ("a@x.com, b@x.com"). */
export function cleanEmail(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  for (const candidate of raw.split(/[\s,;|]+/)) {
    const email = candidate.trim().toLowerCase().replace(/^mailto:/, "");
    if (!EMAIL_PATTERN.test(email)) continue;
    const domain = email.split("@")[1];
    if (JUNK_EMAIL_DOMAINS.has(domain)) continue;
    if (ASSET_SUFFIXES.some((suffix) => email.endsWith(suffix))) continue;
    return email;
  }
  return undefined;
}

/** "example.com/page" -> "https://example.com/page". Undefined if unparseable. */
export function normalizeWebsite(raw: string | undefined | null): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (!url.hostname.includes(".")) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

/** The URL itself if it is an absolute http(s) URL, else undefined. Profile
 * links come straight from imported files and end up in an href, so nothing
 * else (javascript:, data:) may get through. */
export function safeHttpUrl(raw: string | undefined | null): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** The registrable-looking host of a website, without "www.", or undefined
 * when the site lives on a host shared by unrelated businesses. */
export function websiteDomain(website: string | undefined): string | undefined {
  if (!website) return undefined;
  let host: string;
  try {
    host = new URL(website).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return undefined;
  }
  for (const shared of SHARED_HOSTS) {
    if (host === shared || host.endsWith(`.${shared}`)) return undefined;
  }
  return host;
}

function slug(value: string | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The key two rows must share to be treated as the same lead, strongest
 * signal first: the business's own website domain, then its email, then the
 * source's own id, then name + address. Domain first means one company is
 * one lead even when several Maps listings (branches) share a website - so a
 * company is never cold-emailed twice from the same scrape.
 */
export function dedupeKeyFor(lead: LeadInput, source: string): string {
  const domain = websiteDomain(lead.website);
  if (domain) return `domain:${domain}`;
  if (lead.email) return `email:${lead.email}`;
  if (lead.externalId) return `${source}:${lead.externalId}`;
  return `name:${slug(lead.name)}|${slug(lead.address)}`;
}

/**
 * A 0-100 sorting aid: how reachable the lead is, plus a few signals that a
 * web/SEO/PPC agency has something to offer. It is deliberately simple and
 * explainable; AI qualification replaces it as the main signal later.
 */
export function scoreLead(lead: LeadInput): number {
  let score = 0;
  if (lead.email) score += 40;
  if (lead.phone) score += 15;
  if (lead.website) score += 15;
  // An established business (enough reviews) can afford a retainer.
  if ((lead.reviewCount ?? 0) >= 10) score += 10;
  // A middling rating is a reputation/SEO conversation starter.
  if (lead.rating !== undefined && lead.rating < 4.2) score += 10;
  if ((lead.followers ?? 0) >= 1000) score += 10;
  return Math.min(score, 100);
}

/** "1,234" -> 1234, "12.5K" -> 12500. Undefined for anything else. */
export function parseCount(raw: string | undefined | null): number | undefined {
  const trimmed = raw?.trim().replace(/,/g, "");
  if (!trimmed) return undefined;
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*([kmb])?$/i);
  if (!match) return undefined;
  const multiplier = { k: 1e3, m: 1e6, b: 1e9 }[(match[2] ?? "").toLowerCase() as "k" | "m" | "b"] ?? 1;
  return Math.round(Number(match[1]) * multiplier);
}

export function parseRating(raw: string | undefined | null): number | undefined {
  const value = Number(raw?.trim());
  return raw?.trim() && Number.isFinite(value) && value >= 0 && value <= 5 ? value : undefined;
}
