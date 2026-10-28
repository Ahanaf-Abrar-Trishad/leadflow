"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/shared/Button";
import { Field } from "@/components/shared/Field";
import { useUIStore } from "@/store/uiStore";

export function SetupForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const showToast = useUIStore((state) => state.showToast);

  const handleSubmit = async () => {
    if (password !== confirmPassword) {
      showToast("error", "Passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/outreach/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        const body = await response.json();
        showToast("error", body.error?.formErrors?.[0] ?? body.error ?? "Could not create the account.");
        return;
      }
      router.push("/outreach");
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Field
        id="setup-email"
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Field
        id="setup-password"
        label="Password"
        type="password"
        hint="At least 8 characters."
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <Field
        id="setup-confirm-password"
        label="Confirm password"
        type="password"
        error={confirmPassword && password !== confirmPassword ? "Passwords don't match." : undefined}
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
      />
      <Button loading={loading} disabled={!email || password.length < 8} onClick={handleSubmit}>
        Create admin account
      </Button>
    </div>
  );
}
