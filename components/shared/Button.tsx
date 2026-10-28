"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "danger";

export interface ButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> {
  variant?: ButtonVariant;
  loading?: boolean;
  children: ReactNode;
}

/*
 * Disabled primary used to be `bg-signal/50` under white text - about 2.1:1,
 * well under AA and effectively unreadable. A disabled control should read as
 * inert rather than as a washed-out version of the live one, so both variants
 * now resolve to the same recessed treatment: ink-faint on paper is 4.68:1.
 */
const DISABLED_CLASSES =
  "disabled:bg-paper disabled:text-ink-faint disabled:border-border disabled:shadow-none";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  // Both variants carry a border at all times - primary's is transparent -
  // so toggling to the disabled treatment never changes the box size.
  primary: `bg-signal text-white border border-transparent shadow-raised hover:bg-signal-strong ${DISABLED_CLASSES}`,
  secondary: `bg-surface text-ink border border-border-strong shadow-raised hover:bg-paper ${DISABLED_CLASSES}`,
  // Reserved for the confirming press of an irreversible action, never for the
  // button that merely opens its confirmation - a row of red buttons in a list
  // stops reading as a warning and just becomes the colour that list is.
  danger: `bg-danger text-white border border-transparent shadow-raised hover:bg-danger/90 ${DISABLED_CLASSES}`,
};

export function Button({
  variant = "primary",
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      type="button"
      aria-busy={loading || undefined}
      disabled={isDisabled}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium",
        // Named properties rather than `transition-all`: `all` would also
        // animate layout properties, and a transition (not a keyframe) lets a
        // fast double-click retarget mid-flight instead of restarting.
        "transition-[background-color,border-color,box-shadow,transform] duration-200 ease-out",
        // Presses register as a small give. 0.96 is the shallowest scale that
        // still reads as tactile; below ~0.95 it starts to look like a bug.
        "active:scale-[0.96] disabled:active:scale-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
        "disabled:cursor-not-allowed",
        VARIANT_CLASSES[variant],
        className,
      )}
      {...props}
    >
      {loading && (
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
}
