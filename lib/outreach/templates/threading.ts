export interface ThreadHeaders {
  inReplyTo?: string;
  references?: string[];
}

/** Standard email threading: References accumulates every prior message in
 * the thread in order, In-Reply-To points at the immediately previous one.
 * Most mail clients thread primarily on References; In-Reply-To is the
 * narrower "direct parent" signal. */
export function buildThreadHeaders(priorMessageIds: string[]): ThreadHeaders {
  if (priorMessageIds.length === 0) return {};
  return {
    inReplyTo: priorMessageIds[priorMessageIds.length - 1],
    references: priorMessageIds,
  };
}
