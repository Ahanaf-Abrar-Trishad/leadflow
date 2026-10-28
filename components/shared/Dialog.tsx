"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { CloseIcon } from "@/components/shared/icons";
import { cn } from "@/lib/cn";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

/*
 * Built on the native <dialog> rather than a div with `role="dialog"`: calling
 * showModal() gets the focus trap, Esc-to-dismiss, inert background and
 * top-layer stacking from the platform, all of which a hand-rolled modal has
 * to reimplement and typically half-finishes. The only things left to wire up
 * are React's declarative open/closed prop and dismissing on a backdrop click.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    // showModal() on an already-open dialog throws, and close() on an already
    // -closed one silently restarts the exit transition - so both are guarded.
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Esc and the close button both route through the same `close` event, so the
  // parent's state can never drift out of sync with the element's own.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    const handleClose = () => onClose();
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      aria-describedby={description ? "dialog-description" : undefined}
      // A modal <dialog> fills the viewport with its backdrop but the element
      // itself is only as large as its content, so a click landing on the
      // element's own box - rather than a child - is a click on the backdrop.
      onClick={(event) => {
        if (event.target === ref.current) ref.current?.close();
      }}
      className={cn(
        "modal-surface m-auto w-[calc(100vw-2rem)] max-w-md rounded-2xl border border-border bg-surface p-6 text-ink shadow-float",
        "backdrop:cursor-default",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="dialog-title" className="font-display text-lg font-semibold text-ink">
            {title}
          </h2>
          {description && (
            <p id="dialog-description" className="mt-1 text-sm text-ink-muted">
              {description}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => ref.current?.close()}
          aria-label="Close dialog"
          className="hit-area -mr-1 -mt-1 flex h-8 w-8 flex-none items-center justify-center rounded-md text-ink-faint transition-[background-color,color,transform] duration-200 ease-out hover:bg-paper hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal active:scale-[0.96]"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-5">{children}</div>
    </dialog>
  );
}
