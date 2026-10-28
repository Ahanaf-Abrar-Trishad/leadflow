"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/shared/Button";
import { useUIStore } from "@/store/uiStore";

export function SendNowButton({ enrollmentId }: { enrollmentId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const showToast = useUIStore((state) => state.showToast);

  const handleClick = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/outreach/enrollments/${enrollmentId}/send-now`, { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        showToast("error", body?.error ?? "Could not send this email.");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="secondary" loading={loading} onClick={handleClick}>
      Send now
    </Button>
  );
}
