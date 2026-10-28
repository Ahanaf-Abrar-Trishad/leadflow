import { linkKey, signLinkToken, verifyLinkToken } from "@/lib/links/signedLink";

/** The public link token for a proposal. Includes the link version, so
 * bumping it (withdraw, back to draft) revokes every earlier link. */
export function signProposalToken(proposalId: string, linkVersion: number, key: Buffer = linkKey("proposal")): string {
  return signLinkToken(proposalId, linkVersion, key);
}

export function verifyProposalToken(
  token: string,
  key: Buffer = linkKey("proposal"),
): { proposalId: string; linkVersion: number } | null {
  const parsed = verifyLinkToken(token, key);
  return parsed ? { proposalId: parsed.id, linkVersion: parsed.linkVersion } : null;
}
