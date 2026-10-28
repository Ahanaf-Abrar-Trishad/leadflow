"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/shared/Button";
import { useUIStore } from "@/store/uiStore";

const inputClass =
  "min-h-10 rounded-md border border-border-strong bg-surface px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal";

export function SuppressionForm() {
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const showToast = useUIStore((state) => state.showToast);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/outreach/suppressions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, reason }),
      });
      const body = await response.json();
      if (!response.ok) {
        showToast("error", body.error ?? "Could not add this suppression.");
        return;
      }
      setEmail("");
      setReason("");
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <label className="flex flex-col gap-1 text-sm text-ink-muted">
        Email
        <input value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-sm text-ink-muted sm:col-span-1">
        Reason
        <input value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} placeholder="Direct request" />
      </label>
      <Button className="self-end" loading={loading} disabled={!email || !reason} onClick={handleSubmit}>
        Add suppression
      </Button>
    </div>
  );
}
