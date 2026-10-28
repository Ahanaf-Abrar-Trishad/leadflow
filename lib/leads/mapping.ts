import { cleanEmail, normalizeWebsite, parseCount, parseRating, safeHttpUrl, type LeadInput } from "./normalize";

export type LeadFormat = "gmaps" | "scout" | "generic";

export interface MappedLeads {
  leads: LeadInput[];
  /** Rows with nothing to identify or contact the business by. */
  skipped: number;
}

type Row = Record<string, string | undefined>;

function value(row: Row, key: string): string | undefined {
  const raw = row[key]?.trim();
  return raw ? raw : undefined;
}

/** Recognizes the two exports LeadFlow knows column-for-column - the Google
 * Maps engine's CSV and a Scout CSV - and falls back to alias matching. */
export function detectFormat(headers: string[]): LeadFormat {
  const set = new Set(headers.map((h) => h.trim().toLowerCase()));
  if (set.has("place_id") || (set.has("title") && set.has("review_rating"))) return "gmaps";
  if (set.has("username") && (set.has("platform") || set.has("profile_url"))) return "scout";
  return "generic";
}

/** Social profile columns google-maps-scraper-kit adds with --socials. */
const SOCIAL_COLUMNS = ["instagram", "facebook", "linkedin", "twitter", "tiktok", "youtube"];

function socialsFrom(row: Row): Record<string, string> {
  const socials: Record<string, string> = {};
  for (const key of SOCIAL_COLUMNS) {
    const url = safeHttpUrl(row[key]);
    if (url) socials[key] = url;
  }
  return socials;
}

/** One row of the gosom/google-maps-scraper CSV (34 columns). */
export function mapGmapsRow(row: Row): LeadInput | null {
  const name = value(row, "title");
  if (!name) return null;
  const email = cleanEmail(row.emails ?? row.email);
  return {
    name,
    externalId: value(row, "place_id") ?? value(row, "cid"),
    category: value(row, "category"),
    email,
    emailSource: email ? "maps" : undefined,
    phone: value(row, "phone"),
    website: normalizeWebsite(row.website),
    address: value(row, "address"),
    timezone: value(row, "timezone"),
    rating: parseRating(row.review_rating),
    reviewCount: parseCount(row.review_count),
    socials: socialsFrom(row),
  };
}

/** One row of a Scout export. Scout writes every key it collected, so the
 * columns vary by platform and by whether enrichment ran. */
export function mapScoutRow(row: Row): LeadInput | null {
  const username = value(row, "username");
  const fullName = value(row, "full_name");
  const name = fullName ?? username;
  if (!name) return null;
  const platform = value(row, "platform");
  const email = cleanEmail(row.email);
  const emailOrigin = value(row, "email_source");
  return {
    name,
    externalId: username ? `${platform ?? "profile"}:${username.toLowerCase()}` : undefined,
    contactName: fullName,
    category: value(row, "headline") ?? value(row, "category"),
    email,
    emailSource: email ? (emailOrigin ? `scout:${emailOrigin}` : "scout") : undefined,
    phone: value(row, "phone"),
    website: normalizeWebsite(row.website ?? row.external_url),
    platform,
    profileUrl: safeHttpUrl(row.profile_url),
    followers: parseCount(row.follower_count ?? row.followers ?? row.subscriber_count),
  };
}

/** Header aliases for any other CSV (Apollo, a spreadsheet, a purchased
 * list), matched after lowercasing and collapsing punctuation to spaces. */
const ALIASES = {
  company: ["company", "company name", "business", "business name", "organization", "organization name", "account name"],
  name: ["name", "full name", "contact name", "contact"],
  firstName: ["first name", "firstname"],
  lastName: ["last name", "lastname", "surname"],
  email: ["email", "email address", "work email", "e mail", "business email"],
  phone: ["phone", "phone number", "mobile", "telephone", "company phone", "work direct phone"],
  website: ["website", "url", "domain", "company website", "website url"],
  address: ["address", "location", "city", "full address"],
  category: ["category", "industry", "niche", "title", "job title"],
  timezone: ["timezone", "time zone"],
} as const;

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function columnFor(headers: string[], aliases: readonly string[]): string | undefined {
  for (const alias of aliases) {
    const match = headers.find((header) => normalizeHeader(header) === alias);
    if (match) return match;
  }
  return undefined;
}

export function genericColumns(headers: string[]) {
  return Object.fromEntries(
    Object.entries(ALIASES).map(([field, aliases]) => [field, columnFor(headers, aliases)]),
  ) as Record<keyof typeof ALIASES, string | undefined>;
}

export function mapGenericRow(row: Row, columns: ReturnType<typeof genericColumns>): LeadInput | null {
  const get = (column: string | undefined) => (column ? value(row, column) : undefined);
  const company = get(columns.company);
  const joinedName = [get(columns.firstName), get(columns.lastName)].filter(Boolean).join(" ") || undefined;
  const personName = get(columns.name) ?? joinedName;
  const email = cleanEmail(get(columns.email));
  const website = normalizeWebsite(get(columns.website));
  const name = company ?? personName ?? email ?? website;
  if (!name) return null;
  return {
    name,
    contactName: company ? personName : undefined,
    category: get(columns.category),
    email,
    emailSource: email ? "csv" : undefined,
    phone: get(columns.phone),
    website,
    address: get(columns.address),
    timezone: get(columns.timezone),
  };
}

export function mapRows(format: LeadFormat, headers: string[], rows: Row[]): MappedLeads {
  const columns = format === "generic" ? genericColumns(headers) : undefined;
  const leads: LeadInput[] = [];
  let skipped = 0;
  for (const row of rows) {
    const lead =
      format === "gmaps" ? mapGmapsRow(row) : format === "scout" ? mapScoutRow(row) : mapGenericRow(row, columns!);
    // A lead with no way to reach or research it is not worth storing.
    if (!lead || (!lead.email && !lead.website && !lead.phone && !lead.profileUrl)) {
      skipped += 1;
      continue;
    }
    leads.push(lead);
  }
  return { leads, skipped };
}
