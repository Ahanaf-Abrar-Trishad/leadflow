/** Raw lines as typed/pasted - the caller decides how to treat blanks. */
export function splitLines(value: string): string[] {
  if (!value) return [];
  return value.split("\n");
}

/**
 * Blank/whitespace-only lines are never counted (PRD §5.1) - shared by every
 * tool's live line counter and by the line-count limit checks.
 */
export function countNonBlankLines(value: string): number {
  if (!value) return 0;
  return value.split("\n").filter((line) => line.trim().length > 0).length;
}
