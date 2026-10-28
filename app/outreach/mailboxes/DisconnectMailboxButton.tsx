"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/shared/Button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useUIStore } from "@/store/uiStore";

export function DisconnectMailboxButton({
  mailboxId,
  fromEmail,
}: {
  mailboxId: string;
  fromEmail: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const showToast = useUIStore((state) => state.showToast);

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/outreach/mailboxes/${mailboxId}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) {
        // The route rejects a mailbox with live enrollments - that message
        // names the blocker, so it's shown rather than a generic failure.
        showToast("error", body.error ?? "Could not disconnect this mailbox.");
        return;
      }
      setOpen(false);
      showToast("success", "Mailbox disconnected.");
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Disconnect
      </Button>

      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={handleDisconnect}
        loading={loading}
        title="Disconnect this mailbox?"
        confirmLabel="Disconnect"
      >
        <p className="text-sm text-ink-muted">
          <span className="font-medium text-ink">{fromEmail}</span> will be removed from every campaign
          pool and its stored credentials deleted. Sent history is kept. Reconnecting means going
          through the provider&apos;s authorisation again.
        </p>
      </ConfirmDialog>
    </>
  );
}
