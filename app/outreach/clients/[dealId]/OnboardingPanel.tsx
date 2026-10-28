"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/shared/Button";
import { BlueprintCard } from "@/components/outreach/BlueprintCard";
import { useUIStore } from "@/store/uiStore";
import type { OnboardingTask } from "@/db/schema";

export interface OnboardingView {
  id: string;
  tasks: OnboardingTask[];
  intakeUrl: string;
  intakeAnswers: Record<string, string> | null;
  intakeSubmittedAt: string | null;
  welcomeSentAt: string | null;
}

const sectionTitle = "mb-3 font-display text-sm font-semibold uppercase tracking-wide text-ink-muted";

export function OnboardingPanel({
  dealId,
  onboarding,
  questions,
  canEmail,
  kickoffConfigured,
  welcomeDraft,
  defaultWelcome,
}: {
  dealId: string;
  onboarding: OnboardingView | null;
  questions: { key: string; label: string }[];
  canEmail: boolean;
  kickoffConfigured: boolean;
  welcomeDraft: { id: string; content: string } | null;
  defaultWelcome: string;
}) {
  const [tasks, setTasks] = useState(onboarding?.tasks ?? []);
  const [newTask, setNewTask] = useState("");
  const [welcome, setWelcome] = useState(welcomeDraft?.content ?? defaultWelcome);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const showToast = useUIStore((state) => state.showToast);

  const request = async (path: string, method: string, body: unknown, success?: string) => {
    setBusy(true);
    try {
      const response = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        showToast("error", typeof result.error === "string" ? result.error : "That did not work.");
        return false;
      }
      if (success) showToast("success", success);
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  };

  if (!onboarding) {
    return (
      <BlueprintCard>
        <h2 className={sectionTitle}>Onboarding</h2>
        <p className="text-sm text-ink-muted">Onboarding starts automatically when the first invoice is paid.</p>
        <Button className="mt-3" variant="secondary" disabled={busy} onClick={() => request(`/api/outreach/clients/${dealId}/onboarding`, "POST", {}, "Onboarding started.")}>
          They paid outside LeadFlow: start now
        </Button>
      </BlueprintCard>
    );
  }

  const saveTasks = (next: OnboardingTask[]) => {
    setTasks(next);
    void request(`/api/outreach/onboardings/${onboarding.id}/tasks`, "PUT", { tasks: next });
  };
  const doneCount = tasks.filter((task) => task.done).length;

  return (
    <>
      <BlueprintCard>
        <h2 className={sectionTitle}>Welcome email</h2>
        {onboarding.welcomeSentAt ? (
          <p className="text-sm text-ink">Sent {new Date(onboarding.welcomeSentAt).toLocaleString()}.</p>
        ) : !canEmail ? (
          <p className="text-sm text-ink-muted">
            This client has no email conversation. Send them the intake link yourself: <span className="break-all">{onboarding.intakeUrl}</span>
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {welcomeDraft && (
              <p className="text-xs text-ink-muted">
                <span className="font-mono uppercase tracking-[0.14em] text-signal-strong">Drafted by Claude</span> Read and edit before sending.
              </p>
            )}
            <label htmlFor="welcome-text" className="sr-only">
              Welcome email
            </label>
            <textarea
              id="welcome-text"
              rows={8}
              value={welcome}
              onChange={(e) => setWelcome(e.target.value)}
              className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink"
            />
            <p className="text-xs text-ink-faint">
              LeadFlow adds the getting-started form link{kickoffConfigured ? " and your kickoff booking link" : " (set KICKOFF_URL to add a booking link)"} below your text.
            </p>
            <Button
              className="self-start"
              disabled={busy || welcome.trim().length < 10}
              onClick={() =>
                request(
                  `/api/outreach/onboardings/${onboarding.id}/welcome`,
                  "POST",
                  { text: welcome, ...(welcomeDraft ? { draftId: welcomeDraft.id } : {}) },
                  "Welcome email sent.",
                )
              }
            >
              Send welcome email
            </Button>
          </div>
        )}
      </BlueprintCard>

      <BlueprintCard>
        <h2 className={sectionTitle}>Intake form</h2>
        <div className="flex items-start gap-2">
          <code className="min-w-0 flex-1 break-all rounded-md border border-border bg-paper p-2 font-mono text-xs text-ink [font-variant-ligatures:none]">
            {onboarding.intakeUrl}
          </code>
          <Button
            variant="secondary"
            onClick={() => navigator.clipboard.writeText(onboarding.intakeUrl).then(() => showToast("success", "Link copied."))}
          >
            Copy
          </Button>
        </div>
        {onboarding.intakeSubmittedAt && onboarding.intakeAnswers ? (
          <dl className="mt-4 flex flex-col gap-3">
            <p className="text-xs text-ink-faint">Submitted {new Date(onboarding.intakeSubmittedAt).toLocaleString()}</p>
            {questions
              .filter((question) => onboarding.intakeAnswers?.[question.key])
              .map((question) => (
                <div key={question.key}>
                  <dt className="text-xs font-medium text-ink-muted">{question.label}</dt>
                  <dd className="whitespace-pre-line text-sm text-ink">{onboarding.intakeAnswers![question.key]}</dd>
                </div>
              ))}
          </dl>
        ) : (
          <p className="mt-3 text-sm text-ink-muted">Not submitted yet.</p>
        )}
      </BlueprintCard>

      <BlueprintCard>
        <h2 className={sectionTitle}>
          Checklist {doneCount}/{tasks.length}
        </h2>
        <ul className="flex flex-col gap-1">
          {tasks.map((task, index) => (
            <li key={`${task.label}-${index}`} className="flex items-center gap-2">
              <input
                id={`task-${index}`}
                type="checkbox"
                className="h-4 w-4 accent-signal"
                checked={task.done}
                disabled={busy}
                onChange={(e) => saveTasks(tasks.map((t, i) => (i === index ? { ...t, done: e.target.checked } : t)))}
              />
              <label htmlFor={`task-${index}`} className={`flex-1 text-sm ${task.done ? "text-ink-faint line-through" : "text-ink"}`}>
                {task.label}
              </label>
              <button
                type="button"
                aria-label={`Remove ${task.label}`}
                className="text-xs text-ink-faint hover:text-danger"
                onClick={() => saveTasks(tasks.filter((_, i) => i !== index))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newTask.trim()) return;
            saveTasks([...tasks, { label: newTask.trim(), done: false }]);
            setNewTask("");
          }}
        >
          <label htmlFor="new-task" className="sr-only">
            New checklist item
          </label>
          <input
            id="new-task"
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            placeholder="Add an item"
            className="min-w-0 flex-1 rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink"
          />
          <Button type="submit" variant="secondary" disabled={busy || !newTask.trim()}>
            Add
          </Button>
        </form>
      </BlueprintCard>
    </>
  );
}
