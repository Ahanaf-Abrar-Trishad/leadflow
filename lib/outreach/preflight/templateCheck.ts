import { MERGE_FIELD_PATTERN } from "@/lib/outreach/templates/fieldPattern";

export function extractMergeFields(template: string): string[] {
  const fields = new Set<string>();
  for (const match of template.matchAll(MERGE_FIELD_PATTERN)) {
    fields.add(match[1]);
  }
  return [...fields];
}

export interface TemplateContact {
  id: string;
  email: string;
  fields: Record<string, string>;
}

export interface UnresolvedContact {
  contactId: string;
  email: string;
  missing: string[];
}

export function findUnresolvedContacts(templates: string[], contacts: TemplateContact[]): UnresolvedContact[] {
  const requiredFields = new Set<string>();
  for (const template of templates) {
    for (const field of extractMergeFields(template)) requiredFields.add(field);
  }

  const unresolved: UnresolvedContact[] = [];
  for (const contact of contacts) {
    const missing = [...requiredFields].filter((field) => !contact.fields[field]?.trim());
    if (missing.length > 0) unresolved.push({ contactId: contact.id, email: contact.email, missing });
  }
  return unresolved;
}
