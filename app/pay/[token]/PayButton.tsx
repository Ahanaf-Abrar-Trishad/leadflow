"use client";

import { useState } from "react";
import { Button } from "@/components/shared/Button";

export function PayButton({ token, label }: { token: string; label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/pay/${encodeURIComponent(token)}/checkout`, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || typeof body.url !== "string") {
        setError(typeof body.error === "string" ? body.error : "Could not start the payment. Please try again.");
        return;
      }
      window.location.assign(body.url);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button loading={busy} onClick={pay} className="w-full">
        {label}
      </Button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </>
  );
}
