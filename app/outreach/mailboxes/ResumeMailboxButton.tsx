"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/shared/Button";
import { useUIStore } from "@/store/uiStore";

export function ResumeMailboxButton({ mailboxId }: { mailboxId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const showToast = useUIStore((state) => state.showToast);

  const handleResume = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/outreach/mailboxes/${mailboxId}/resume`, { method: "PATCH" });
      if (!response.ok) {
        showToast("error", "Could not resume this mailbox.");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="secondary" loading={loading} onClick={handleResume}>
      Resume sending
    </Button>
  );
}
