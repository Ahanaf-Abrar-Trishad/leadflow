import { MERGE_FIELD_PATTERN } from "./fieldPattern";

export function renderTemplate(template: string, fields: Record<string, string>): string {
  return template.replace(MERGE_FIELD_PATTERN, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(fields, key) ? fields[key] : match,
  );
}
