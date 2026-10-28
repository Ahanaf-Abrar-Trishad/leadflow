"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/shared/Button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useUIStore } from "@/store/uiStore";

export function RemoveSuppressionButton({ id, email }: { id: string; email: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const showToast = useUIStore((state) => state.showToast);

  const handleRemove = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/outreach/suppressions/${id}`, { method: "DELETE" });
      if (!response.ok) {
        showToast("error", "Could not remove this suppression.");
        return;
      }
      setOpen(false);
      showToast("success", "Address removed from the suppression list.");
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Remove
      </Button>

      {/* Confirmed rather than immediate: the row may be here because the
          person asked not to be contacted, and removing it makes them
          eligible for every future import again. */}
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={handleRemove}
        loading={loading}
        title="Remove from suppression list?"
        confirmLabel="Remove"
      >
        <p className="text-sm text-ink-muted">
          <span className="font-medium text-ink">{email}</span> becomes eligible for campaigns again.
          If this address hard-bounced or opted out, contacting it again risks both deliverability and
          compliance.
        </p>
      </ConfirmDialog>
    </>
  );
}
