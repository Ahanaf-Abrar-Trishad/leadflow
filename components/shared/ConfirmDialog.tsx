"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/shared/Button";
import { Dialog } from "@/components/shared/Dialog";

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  /** Names the action instead of saying "OK", so the button states what happens. */
  confirmLabel: string;
  loading?: boolean;
  /** Extra context - what exactly is about to be affected. */
  children?: ReactNode;
}

/*
 * The confirmation step for irreversible actions, replacing window.confirm.
 *
 * Beyond being unstyleable, window.confirm gives the destructive answer the
 * same weight as the safe one and labels them "OK"/"Cancel" - so the user
 * confirms without the sentence ever naming what is about to happen. Here the
 * confirm button carries the verb and Cancel is what the dialog opens focused
 * on by virtue of coming first in the DOM.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  loading = false,
  children,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title={title} description={description}>
      {children}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="danger" loading={loading} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
