"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/shared/Button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Dialog } from "@/components/shared/Dialog";
import { Field } from "@/components/shared/Field";
import { useUIStore } from "@/store/uiStore";

interface UserRow {
  id: string;
  email: string;
  role: string;
}

const selectClass =
  "min-h-10 rounded-md border border-border-strong bg-surface px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal";

export function UserManagement({ users, currentUserId }: { users: UserRow[]; currentUserId: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [loading, setLoading] = useState(false);
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<UserRow | null>(null);
  const [removeLoading, setRemoveLoading] = useState(false);
  const router = useRouter();
  const showToast = useUIStore((state) => state.showToast);

  const handleCreate = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/outreach/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, role }),
      });
      if (!response.ok) {
        showToast("error", "Could not create the user.");
        return;
      }
      setEmail("");
      setPassword("");
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    setRemoveLoading(true);
    try {
      const response = await fetch(`/api/outreach/users/${removeTarget.id}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json();
        showToast("error", body.error ?? "Could not remove the user.");
        return;
      }
      setRemoveTarget(null);
      router.refresh();
    } finally {
      setRemoveLoading(false);
    }
  };

  const openResetDialog = (user: UserRow) => {
    setResetPassword("");
    setResetTarget(user);
  };

  const handleResetPassword = async () => {
    if (!resetTarget) return;
    setResetLoading(true);
    try {
      const response = await fetch(`/api/outreach/users/${resetTarget.id}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: resetPassword }),
      });
      if (!response.ok) {
        showToast("error", "Could not reset the password.");
        return;
      }
      setResetTarget(null);
      showToast("success", "Password reset. They've been signed out everywhere.");
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <ul className="flex flex-col gap-2">
        {users.map((user) => (
          <li key={user.id} className="blueprint flex items-center justify-between p-4 text-sm">
            <i className="corner tl" aria-hidden="true" />
            <i className="corner tr" aria-hidden="true" />
            <i className="corner bl" aria-hidden="true" />
            <i className="corner br" aria-hidden="true" />
            <div>
              <span className="font-medium text-ink">{user.email}</span>{" "}
              <span className="font-mono text-xs text-ink-faint">{user.role}</span>
              {user.id === currentUserId && <span className="ml-2 text-xs text-ink-faint">(you)</span>}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => openResetDialog(user)}>
                Reset password
              </Button>
              <Button variant="secondary" onClick={() => setRemoveTarget(user)}>
                Remove
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <div className="blueprint p-6">
        <i className="corner tl" aria-hidden="true" />
        <i className="corner tr" aria-hidden="true" />
        <i className="corner bl" aria-hidden="true" />
        <i className="corner br" aria-hidden="true" />
        <h2 className="font-display text-lg font-semibold text-ink">Add a user</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="new-user-email" label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Field
            id="new-user-password"
            label="Temporary password"
            type="password"
            hint="At least 8 characters."
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
            Role
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "admin" | "member")}
              className={selectClass}
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <Button
            className="self-end"
            loading={loading}
            disabled={!email || password.length < 8}
            onClick={handleCreate}
          >
            Create user
          </Button>
        </div>
      </div>

      <Dialog
        open={resetTarget !== null}
        onClose={() => setResetTarget(null)}
        title="Reset password"
        description={resetTarget ? `Sets a new password for ${resetTarget.email} and signs them out everywhere.` : undefined}
      >
        <Field
          id="reset-password"
          label="New password"
          type="password"
          hint="At least 8 characters."
          value={resetPassword}
          onChange={(e) => setResetPassword(e.target.value)}
        />
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setResetTarget(null)}>
            Cancel
          </Button>
          <Button loading={resetLoading} disabled={resetPassword.length < 8} onClick={handleResetPassword}>
            Reset password
          </Button>
        </div>
      </Dialog>

      <ConfirmDialog
        open={removeTarget !== null}
        onClose={() => setRemoveTarget(null)}
        onConfirm={handleRemove}
        loading={removeLoading}
        title="Remove this user?"
        confirmLabel="Remove"
      >
        <p className="text-sm text-ink-muted">
          <span className="font-medium text-ink">{removeTarget?.email}</span> will lose access immediately.
          This can&apos;t be undone from here - they would need to be added again.
        </p>
      </ConfirmDialog>
    </div>
  );
}
