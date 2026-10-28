"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/shared/Button";
import { Checkbox } from "@/components/shared/Checkbox";
import { Field } from "@/components/shared/Field";
import { useUIStore } from "@/store/uiStore";

export function ScrapeForm({ disabled }: { disabled: boolean }) {
  const [keyword, setKeyword] = useState("");
  const [location, setLocation] = useState("");
  const [depth, setDepth] = useState("5");
  const [collectEmails, setCollectEmails] = useState(true);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const showToast = useUIStore((state) => state.showToast);

  const depthNumber = Number(depth);
  const depthValid = Number.isInteger(depthNumber) && depthNumber >= 1 && depthNumber <= 20;

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/outreach/leads/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword, location, depth: depthNumber, collectEmails }),
      });
      const body = await response.json();
      if (!response.ok) {
        showToast("error", typeof body.error === "string" ? body.error : "Could not start the scrape. Check the fields.");
        return;
      }
      showToast("success", "Scrape started. This page updates when it finishes.");
      setKeyword("");
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field
          id="scrape-keyword"
          label="Business type"
          placeholder="dentists"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
        <Field
          id="scrape-location"
          label="City"
          placeholder="Austin, TX"
          value={location}
          onChange={(event) => setLocation(event.target.value)}
        />
        <Field
          id="scrape-depth"
          label="Depth"
          type="number"
          min={1}
          max={20}
          value={depth}
          onChange={(event) => setDepth(event.target.value)}
          hint="How far to scroll the results, 1-20. 5 is about 40-60 businesses."
          error={depthValid ? undefined : "Enter a whole number from 1 to 20."}
        />
      </div>
      <Checkbox
        id="scrape-emails"
        label="Find emails"
        description="Visits each business's website for an email address. Slower, but most leads are useless without one."
        checked={collectEmails}
        onChange={setCollectEmails}
      />
      <Button
        className="self-start"
        loading={loading}
        disabled={disabled || keyword.trim().length < 2 || location.trim().length < 2 || !depthValid}
        onClick={handleSubmit}
      >
        {disabled ? "A scrape is running" : "Start scrape"}
      </Button>
    </div>
  );
}
