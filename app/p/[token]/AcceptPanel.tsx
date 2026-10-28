"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/shared/Button";
import { Checkbox } from "@/components/shared/Checkbox";
import { Field } from "@/components/shared/Field";

export function AcceptPanel({
  token,
  status,
  signerName,
  acceptedAt,
}: {
  token: string;
  status: string;
  signerName: string | null;
  acceptedAt: string | null;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  if (status === "accepted") {
    return (
      <div className="rounded-2xl border border-signal/25 bg-signal-soft p-6 text-center">
        <p className="font-display text-xl font-semibold text-ink">Accepted - thank you!</p>
        <p className="mt-1 text-sm text-ink-muted">
          Signed electronically by {signerName}
          {acceptedAt ? ` on ${new Date(acceptedAt).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })}` : ""}.
          We will be in touch about next steps. You can print this page for your records.
        </p>
      </div>
    );
  }
  if (status === "declined") {
    return (
      <p className="rounded-2xl border border-border bg-surface p-6 text-center text-sm text-ink-muted">
        You declined this proposal. Thanks for letting us know.
      </p>
    );
  }
  if (status === "expired") {
    return (
      <p className="rounded-2xl border border-border bg-surface p-6 text-center text-sm text-ink-muted">
        This proposal has expired. Reply to our last email and we will send you an updated one.
      </p>
    );
  }

  const post = async (action: "accept" | "decline", body: unknown) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/p/${encodeURIComponent(token)}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(typeof result.error === "string" ? result.error : "Something went wrong. Please try again.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  return (
    <section aria-labelledby="accept-heading" className="rounded-2xl border border-border bg-surface p-6 shadow-raised">
      <h2 id="accept-heading" className="font-display text-xl font-semibold text-ink">
        Accept this proposal
      </h2>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="signer-name" label="Full name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        <Field
          id="signer-email"
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <Checkbox
        id="signer-agree"
        className="mt-3"
        label="I agree to this proposal and its terms"
        description="By ticking this box and pressing Accept, I am signing electronically and agree that my electronic signature has the same effect as a handwritten one."
        checked={agreed}
        onChange={setAgreed}
      />
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          loading={busy && !declining}
          disabled={busy || !agreed || name.trim().length < 2 || !emailLooksValid}
          onClick={() => post("accept", { name, email, agreed: true })}
        >
          Accept and sign
        </Button>
        {!declining ? (
          <button type="button" onClick={() => setDeclining(true)} className="text-sm text-ink-muted underline">
            Decline
          </button>
        ) : null}
      </div>
      {declining && (
        <div className="mt-4 border-t border-border pt-4">
          <label htmlFor="decline-reason" className="text-sm font-medium text-ink">
            Anything we should know? (optional)
          </label>
          <textarea
            id="decline-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
          />
          <div className="mt-2 flex gap-3">
            <Button variant="secondary" loading={busy} disabled={busy} onClick={() => post("decline", { reason })}>
              Decline proposal
            </Button>
            <button type="button" onClick={() => setDeclining(false)} className="text-sm text-ink-muted">
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
