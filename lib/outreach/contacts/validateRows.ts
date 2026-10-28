export interface ContactRowInput {
  email: string;
  fields: Record<string, string>;
}

export interface ContactValidationResult {
  valid: ContactRowInput[];
  invalid: { row: number; email: string; reason: string }[];
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateContactRows(
  rows: Record<string, string>[],
  emailColumn: string,
  /** Maps a raw CSV header to the merge-field key it should be stored
   * under (e.g. "Name " -> "first_name"). A header missing from this map
   * falls back to its own name; a header mapped to "" is dropped, letting
   * the caller skip columns that aren't merge fields. */
  fieldMapping: Record<string, string> = {},
): ContactValidationResult {
  const valid: ContactRowInput[] = [];
  const invalid: ContactValidationResult["invalid"] = [];
  const seen = new Set<string>();

  rows.forEach((row, index) => {
    const rawEmail = (row[emailColumn] ?? "").trim();
    const email = rawEmail.toLowerCase();

    if (!rawEmail) {
      invalid.push({ row: index, email: rawEmail, reason: "Missing email address" });
      return;
    }
    if (!EMAIL_PATTERN.test(rawEmail)) {
      invalid.push({ row: index, email: rawEmail, reason: "Invalid email address" });
      return;
    }
    if (seen.has(email)) {
      invalid.push({ row: index, email: rawEmail, reason: "Duplicate within this file" });
      return;
    }
    seen.add(email);

    const fields: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      if (key === emailColumn) continue;
      const mappedKey = (fieldMapping[key] ?? key).trim();
      if (!mappedKey) continue;
      fields[mappedKey] = value;
    }
    valid.push({ email, fields });
  });

  return { valid, invalid };
}
