"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/shared/Button";
import { Dialog } from "@/components/shared/Dialog";
import { Field } from "@/components/shared/Field";
import { useUIStore } from "@/store/uiStore";

export function EditMailboxButton({
  mailboxId,
  fromName,
  dailyCap,
}: {
  mailboxId: string;
  fromName: string;
  dailyCap: number;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(fromName);
  const [cap, setCap] = useState(String(dailyCap));
  const [error, setError] = useState<string | undefined>();
  const router = useRouter();
  const showToast = useUIStore((state) => state.showToast);

  // Reopening after a cancelled edit should show what's stored, not the
  // half-typed values the user just walked away from.
  const openDialog = () => {
    setName(fromName);
    setCap(String(dailyCap));
    setError(undefined);
    setOpen(true);
  };

  const handleSave = async () => {
    const parsedCap = Number(cap);
    if (!Number.isInteger(parsedCap) || parsedCap <= 0) {
      setError("Must be a whole number above zero.");
      return;
    }
    if (!name.trim()) {
      setError("Display name can't be empty.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/outreach/mailboxes/${mailboxId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromName: name.trim(), dailyCap: parsedCap }),
      });
      if (!response.ok) {
        showToast("error", "Could not update this mailbox.");
        return;
      }
      setOpen(false);
      showToast("success", "Mailbox updated.");
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button variant="secondary" onClick={openDialog}>
        Edit
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Edit mailbox"
        description="Credentials aren't editable here — reconnect the mailbox to change those."
      >
        <div className="flex flex-col gap-4">
          <Field
            id={`mailbox-name-${mailboxId}`}
            label="Display name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setError(undefined);
            }}
          />
          <Field
            id={`mailbox-cap-${mailboxId}`}
            label="Daily send cap"
            type="number"
            min={1}
            inputMode="numeric"
            hint="New mailboxes ramp from 15/day regardless of this ceiling."
            error={error}
            value={cap}
            onChange={(event) => {
              setCap(event.target.value);
              setError(undefined);
            }}
          />
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button loading={loading} onClick={handleSave}>
            Save changes
          </Button>
        </div>
      </Dialog>
    </>
  );
}
