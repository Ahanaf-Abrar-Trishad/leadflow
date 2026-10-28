import type { CampaignPerformanceRow } from "@/lib/outreach/dashboard/queries";

/** Campaign-level bounce ratio (bounced / enrolled) that surfaces a campaign
 * as needing attention - a lighter-weight signal than a full preflight
 * re-check (SPF/DKIM/DMARC lookups), which is reserved for the campaign
 * detail page where it's a single-campaign, on-demand read rather than N DNS
 * round trips per list/dashboard view. */
export const CAMPAIGN_BOUNCE_ATTENTION_RATE = 0.03;

export function campaignBounceRatio(row: Pick<CampaignPerformanceRow, "bounced" | "enrolled">): number {
  return row.enrolled > 0 ? row.bounced / row.enrolled : 0;
}

export function campaignNeedsAttention(row: CampaignPerformanceRow): boolean {
  if (row.status !== "active" && row.status !== "paused") return false;
  return campaignBounceRatio(row) >= CAMPAIGN_BOUNCE_ATTENTION_RATE;
}
