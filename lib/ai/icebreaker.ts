export const ICEBREAKER_MIN_LENGTH = 20;
export const ICEBREAKER_MAX_LENGTH = 400;

/** A draft operation the caller can show to the person (or to Claude) as is. */
export class DraftError extends Error {}

/** Trims and checks an opening line, from Claude or from an operator's edit. */
export function validateIcebreaker(raw: string): string {
  const text = raw.replace(/\s+/g, " ").trim();
  if (text.length < ICEBREAKER_MIN_LENGTH) throw new DraftError(`An icebreaker must be at least ${ICEBREAKER_MIN_LENGTH} characters.`);
  if (text.length > ICEBREAKER_MAX_LENGTH) throw new DraftError(`An icebreaker must be at most ${ICEBREAKER_MAX_LENGTH} characters.`);
  // Templates use {{field}} syntax; braces in a field value would read as a
  // merge field to anyone editing the template later.
  if (/[{}]/.test(text)) throw new DraftError("An icebreaker cannot contain { or }.");
  return text;
}
