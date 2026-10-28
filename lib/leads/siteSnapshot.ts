import { fetchPublicPageDetailed, type PageFetcherOptions } from "./websiteEmails";

/**
 * What a web, SEO or PPC agency would notice in thirty seconds on a lead's
 * homepage. Every field is read from the HTML itself, so the result is cheap
 * to compute and safe to hand to Claude as the basis for an opening line.
 */
export interface SiteSnapshot {
  url: string;
  https: boolean;
  responseMs: number;
  title?: string;
  metaDescription?: string;
  h1?: string;
  /** Has a responsive viewport meta tag - a basic mobile-friendliness signal. */
  mobileViewport: boolean;
  /** Latest year in a copyright notice, a rough "last touched" signal. */
  copyrightYear?: number;
  platform?: string;
  googleAnalytics: boolean;
  googleAds: boolean;
  metaPixel: boolean;
  bookingWidget: boolean;
  /** Visible text, trimmed. Untrusted: it is whatever the site says. */
  textExcerpt: string;
}

const PLATFORMS: [string, RegExp][] = [
  ["WordPress", /wp-content|wp-includes/i],
  ["Wix", /wixstatic\.com|wix\.com/i],
  ["Squarespace", /squarespace(-cdn)?\.com/i],
  ["Shopify", /cdn\.shopify\.com/i],
  ["GoDaddy Website Builder", /img1\.wsimg\.com|godaddy/i],
  ["Webflow", /webflow\.(com|io)/i],
  ["Weebly", /weebly\.com/i],
];

const EXCERPT_LENGTH = 1500;

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}

function clean(text: string | undefined): string | undefined {
  const value = text ? decodeEntities(text.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim() : "";
  return value ? value.slice(0, 300) : undefined;
}

function metaContent(html: string, name: string): string | undefined {
  const tag = html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*>`, "i"))?.[0];
  return clean(tag?.match(/content=["']([^"']*)["']/i)?.[1]);
}

export function analyzeHtml(html: string, url: string, responseMs: number): SiteSnapshot {
  const years = [...html.matchAll(/(?:©|&copy;|copyright)[^<]{0,40}?((?:19|20)\d{2})(?:\s*[-–]\s*((?:19|20)\d{2}))?/gi)]
    .flatMap((match) => [match[1], match[2]])
    .filter(Boolean)
    .map(Number);

  const visibleText = decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();

  return {
    url,
    https: url.startsWith("https://"),
    responseMs,
    title: clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]),
    metaDescription: metaContent(html, "description"),
    h1: clean(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]),
    mobileViewport: /<meta[^>]+name=["']viewport["'][^>]*width=device-width/i.test(html),
    copyrightYear: years.length > 0 ? Math.max(...years) : undefined,
    platform: PLATFORMS.find(([, pattern]) => pattern.test(html))?.[0],
    googleAnalytics: /googletagmanager\.com|google-analytics\.com|gtag\(\s*['"]config['"]\s*,\s*['"]G-/i.test(html),
    googleAds: /googleadservices\.com|gtag\(\s*['"]config['"]\s*,\s*['"]AW-|['"]AW-\d+/i.test(html),
    metaPixel: /connect\.facebook\.net\/[^"']*fbevents|fbq\(\s*['"]init/i.test(html),
    bookingWidget: /calendly\.com|acuityscheduling|zocdoc|localmed|nexhealth|booksy|vagaro|opentable|mindbodyonline/i.test(html),
    textExcerpt: visibleText.slice(0, EXCERPT_LENGTH),
  };
}

/** Fetches the homepage (SSRF-guarded) and analyzes it, or null if the site
 * cannot be reached - which is itself worth knowing about a lead. */
export async function snapshotSite(website: string, options: PageFetcherOptions = {}): Promise<SiteSnapshot | null> {
  const page = await fetchPublicPageDetailed(website, options);
  return page ? analyzeHtml(page.html, page.finalUrl, page.responseMs) : null;
}
