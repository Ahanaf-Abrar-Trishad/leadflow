"use client";

import { useState } from "react";
import { Button } from "@/components/shared/Button";
import type { IntakeQuestion } from "@/lib/onboarding/content";

const inputClass =
  "w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal";

export function IntakeForm({
  token,
  questions,
  initialAnswers,
  submittedAt,
  kickoffUrl,
}: {
  token: string;
  questions: IntakeQuestion[];
  initialAnswers: Record<string, string>;
  submittedAt: string | null;
  kickoffUrl: string | null;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/intake/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(answers),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(typeof body.error === "string" ? body.error : "Could not save your answers. Please try again.");
        return;
      }
      setDone(true);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="mt-6 rounded-xl bg-signal-soft p-5 text-sm text-ink">
        <p className="font-semibold">Thank you - we have your answers.</p>
        {kickoffUrl ? (
          <p className="mt-1">
            Next, pick a time for our kickoff call:{" "}
            <a href={kickoffUrl} className="text-signal-strong underline" rel="noopener noreferrer" target="_blank">
              book the kickoff call
            </a>
            .
          </p>
        ) : (
          <p className="mt-1">We will be in touch shortly to schedule the kickoff call.</p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-6 flex flex-col gap-5">
      {submittedAt && (
        <p className="rounded-md bg-paper p-3 text-sm text-ink-muted">
          You sent this on {new Date(submittedAt).toLocaleDateString("en-US", { dateStyle: "long" })}. Change anything
          below and submit again.
        </p>
      )}
      {questions.map((question) => {
        const id = `intake-${question.key}`;
        const value = answers[question.key] ?? "";
        const onChange = (next: string) => setAnswers((prev) => ({ ...prev, [question.key]: next }));
        return (
          <div key={question.key} className="flex flex-col gap-1">
            <label htmlFor={id} className="text-sm font-medium text-ink">
              {question.label}
              {question.required && <span className="text-danger"> *</span>}
            </label>
            {question.long ? (
              <textarea id={id} rows={3} className={inputClass} value={value} required={question.required} onChange={(e) => onChange(e.target.value)} />
            ) : (
              <input id={id} className={inputClass} value={value} required={question.required} onChange={(e) => onChange(e.target.value)} />
            )}
            {question.hint && <p className="text-xs text-ink-faint">{question.hint}</p>}
          </div>
        );
      })}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="submit" loading={busy} className="self-start">
        {submittedAt ? "Update answers" : "Send"}
      </Button>
    </form>
  );
}
