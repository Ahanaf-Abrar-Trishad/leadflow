import type { IntakeAnswers, OnboardingTask } from "@/db/schema";

/** An onboarding problem the caller can show to the person as is. */
export class OnboardingError extends Error {}

/** Starting checklist for every new client; the operator adds or removes
 * items per client. */
export const DEFAULT_TASKS: OnboardingTask[] = [
  { label: "Send the welcome email", done: false },
  { label: "Intake form submitted", done: false },
  { label: "Kickoff call held", done: false },
  { label: "Domain and DNS access", done: false },
  { label: "Website or CMS access", done: false },
  { label: "Google Business Profile manager access", done: false },
  { label: "Google Analytics and Search Console set up", done: false },
  { label: "Logo, photos and brand colors received", done: false },
  { label: "Project plan shared with the client", done: false },
];

export interface IntakeQuestion {
  key: string;
  label: string;
  hint?: string;
  long?: boolean;
  required?: boolean;
}

/**
 * The client's intake form. It deliberately never asks for passwords:
 * credentials typed into a web form end up stored in plain text. It asks who
 * can grant access instead, and the agency requests access the proper way
 * (Google Business Profile manager invite, registrar delegate, CMS user).
 */
export const INTAKE_QUESTIONS: IntakeQuestion[] = [
  { key: "contact_name", label: "Main contact for this project", required: true },
  { key: "contact_phone", label: "Best phone number" },
  { key: "best_time", label: "Best days and times to reach you" },
  { key: "goals", label: "What would make this project a success for you?", long: true, required: true },
  { key: "services", label: "Your main services, in order of importance", long: true },
  { key: "ideal_customers", label: "Who are your ideal customers?", long: true },
  { key: "competitors", label: "Competitors or websites you like, and why", long: true },
  { key: "brand", label: "Brand colors and fonts, if you have them" },
  { key: "assets_link", label: "Link to your logo and photos", hint: "A Google Drive, Dropbox or OneDrive folder link." },
  {
    key: "access_contacts",
    label: "Who can give us access to your domain, website and Google Business Profile?",
    hint: "Names and emails only. Please do not send passwords; we will request access through each service.",
    long: true,
  },
  { key: "anything_else", label: "Anything else we should know?", long: true },
];

export const INTAKE_ANSWER_MAX_LENGTH = 4000;

/** Keeps known questions only, trimmed and length-capped; checks required ones. */
export function cleanIntakeAnswers(raw: Record<string, unknown>): IntakeAnswers {
  const answers: IntakeAnswers = {};
  for (const question of INTAKE_QUESTIONS) {
    const value = raw[question.key];
    const text = typeof value === "string" ? value.trim().slice(0, INTAKE_ANSWER_MAX_LENGTH) : "";
    if (question.required && !text) throw new OnboardingError(`Please answer: ${question.label}`);
    if (text) answers[question.key] = text;
  }
  return answers;
}
