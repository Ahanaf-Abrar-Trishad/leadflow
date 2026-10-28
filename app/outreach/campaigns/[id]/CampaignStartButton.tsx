"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/shared/Button";
import { useUIStore } from "@/store/uiStore";

export function CampaignStartButton({ campaignId }: { campaignId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const showToast = useUIStore((state) => state.showToast);

  const handleStart = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/outreach/campaigns/${campaignId}/start`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) {
        showToast("error", body.error ?? "Could not start campaign.");
        return;
      }
      showToast("success", `Campaign started - ${body.enrolled} contacts scheduled.`);
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button className="mt-4" loading={loading} onClick={handleStart}>
      Start campaign
    </Button>
  );
}
