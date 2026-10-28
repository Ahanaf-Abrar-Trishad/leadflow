import type { leads } from "@/db/schema";
import type { ContactRowInput } from "@/lib/outreach/contacts/validateRows";
import { websiteDomain } from "./normalize";

type LeadRow = typeof leads.$inferSelect;

/**
 * Merge fields a lead brings into a campaign, usable in templates as
 * {{company}}, {{greeting}}, {{website}} etc. A field is only set when the
 * lead actually has the value, so campaign preflight can flag a template
 * that uses one of them for a lead that lacks it. {{greeting}} is always
 * set: the contact's first name when known, otherwise "there".
 */
export function leadMergeFields(lead: LeadRow): Record<string, string> {
  const firstName = lead.contactName?.trim().split(/\s+/)[0];
  const fields: Record<string, string> = {
    company: lead.name,
    greeting: firstName || "there",
  };
  const optional: Record<string, string | number | null | undefined> = {
    first_name: firstName,
    full_name: lead.contactName,
    website: lead.website,
    domain: websiteDomain(lead.website ?? undefined),
    category: lead.category,
    phone: lead.phone,
    address: lead.address,
    rating: lead.rating,
    review_count: lead.reviewCount,
  };
  for (const [key, value] of Object.entries(optional)) {
    if (value !== null && value !== undefined && String(value).trim() !== "") fields[key] = String(value);
  }
  return fields;
}

export function leadToContactRow(lead: LeadRow & { email: string }): ContactRowInput {
  return {
    email: lead.email.toLowerCase(),
    fields: leadMergeFields(lead),
    timezone: isValidTimezone(lead.timezone) ? lead.timezone : undefined,
    source: `lead:${lead.source}`,
  };
}

function isValidTimezone(zone: string | null): zone is string {
  if (!zone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
