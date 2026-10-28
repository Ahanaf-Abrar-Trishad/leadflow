"use client";

import { useEffect, type ComponentType, type SVGProps } from "react";
import { useUIStore, type ToastVariant } from "@/store/uiStore";
import {
  CheckIcon,
  CloseIcon,
  ErrorIcon,
  InfoIcon,
  WarningIcon,
} from "@/components/shared/icons";
import { cn } from "@/lib/cn";

const VARIANT_ICONS: Record<
  ToastVariant,
  ComponentType<SVGProps<SVGSVGElement>>
> = {
  info: InfoIcon,
  success: CheckIcon,
  warning: WarningIcon,
  error: ErrorIcon,
};

const VARIANT_BADGE_CLASSES: Record<ToastVariant, string> = {
  info: "bg-paper text-ink-muted",
  success: "bg-signal-soft text-signal",
  warning: "bg-flag-soft text-flag",
  error: "bg-danger-soft text-danger",
};

const VARIANT_LABELS: Record<ToastVariant, string> = {
  info: "Info",
  success: "Success",
  warning: "Warning",
  error: "Error",
};

const AUTO_DISMISS_MS = 4000;
// Toasts with an undo-style action stay up longer so there's a fair chance to click it.
const AUTO_DISMISS_WITH_ACTION_MS = 8000;

function ToastItem({
  id,
  variant,
  message,
  action,
}: {
  id: string;
  variant: ToastVariant;
  message: string;
  action?: { label: string; onAction: () => void };
}) {
  const dismissToast = useUIStore((state) => state.dismissToast);

  useEffect(() => {
    const timer = setTimeout(
      () => dismissToast(id),
      action ? AUTO_DISMISS_WITH_ACTION_MS : AUTO_DISMISS_MS,
    );
    return () => clearTimeout(timer);
  }, [id, dismissToast, action]);

  const VariantIcon = VARIANT_ICONS[variant];

  return (
    // `rounded-xl` (16) around `p-2` (8) badges keeps the corner radii
    // concentric; the layered shadow does the separating work a border would
    // otherwise do against an arbitrary page background.
    <div className="toast-enter flex items-start gap-3 rounded-xl border border-border bg-surface p-2 pl-3 shadow-float">
      <span
        className={cn(
          "mt-1.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
          VARIANT_BADGE_CLASSES[variant],
        )}
      >
        <VariantIcon className="h-3 w-3" />
      </span>
      <span className="sr-only">{VARIANT_LABELS[variant]}:</span>
      <p className="flex-1 py-1.5 text-sm text-ink">{message}</p>
      {action && (
        <button
          type="button"
          onClick={() => {
            action.onAction();
            dismissToast(id);
          }}
          className="shrink-0 rounded-md px-2 py-1.5 text-sm font-medium text-signal transition-[background-color,transform] duration-200 ease-out hover:bg-signal-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal active:scale-[0.96]"
        >
          {action.label}
        </button>
      )}
      <button
        type="button"
        onClick={() => dismissToast(id)}
        aria-label="Dismiss notification"
        // Visually 32px to sit level with the action button, but `hit-area`
        // pushes the tappable region out to the 40px minimum.
        className="hit-area flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-faint transition-[background-color,color,transform] duration-200 ease-out hover:bg-paper hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal active:scale-[0.96]"
      >
        <CloseIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

export function ToastViewport() {
  const toasts = useUIStore((state) => state.toasts);

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4 sm:right-4 sm:left-auto sm:translate-x-0"
    >
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastItem {...toast} />
        </div>
      ))}
    </div>
  );
}
