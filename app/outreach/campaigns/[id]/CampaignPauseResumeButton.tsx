"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/shared/Button";
import { useUIStore } from "@/store/uiStore";

export function CampaignPauseResumeButton({ campaignId, status }: { campaignId: string; status: "active" | "paused" }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const showToast = useUIStore((state) => state.showToast);

  const action = status === "active" ? "pause" : "resume";
  const label = status === "active" ? "Pause campaign" : "Resume campaign";

  const handleClick = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/outreach/campaigns/${campaignId}/${action}`, { method: "PATCH" });
      if (!response.ok) {
        showToast("error", `Could not ${action} this campaign.`);
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="secondary" loading={loading} onClick={handleClick}>
      {label}
    </Button>
  );
}
