/** Pipeline stages, in board order. Kept free of `db` imports so client
 * components can use them. */
export const DEAL_STAGES = ["replied", "call_booked", "proposal", "won", "lost"] as const;
export type DealStage = (typeof DEAL_STAGES)[number];

export const STAGE_LABELS: Record<DealStage, string> = {
  replied: "Replied",
  call_booked: "Call booked",
  proposal: "Proposal",
  won: "Won",
  lost: "Lost",
};

export function isDealStage(value: string): value is DealStage {
  return (DEAL_STAGES as readonly string[]).includes(value);
}

/** Reply categories Claude may assign, with the label the inbox shows. */
export const REPLY_CATEGORIES = [
  "interested",
  "question",
  "not_now",
  "not_interested",
  "unsubscribe",
  "out_of_office",
  "other",
] as const;
export type ReplyCategory = (typeof REPLY_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<ReplyCategory, string> = {
  interested: "Interested",
  question: "Question",
  not_now: "Not now",
  not_interested: "Not interested",
  unsubscribe: "Wants out",
  out_of_office: "Out of office",
  other: "Other",
};

/** Categories that never get a drafted answer: the right response to these
 * is no email, or the operator's own judgement. */
export const NO_DRAFT_CATEGORIES: readonly ReplyCategory[] = ["unsubscribe", "out_of_office", "not_interested"];
