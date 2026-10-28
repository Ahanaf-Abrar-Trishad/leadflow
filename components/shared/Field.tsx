"use client";

import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  id: string;
  label: string;
  /** Standing help text - what to put here, or the unit it's measured in. */
  hint?: string;
  /** Set only when the value is actually wrong; wires up the alert and styling. */
  error?: string;
}

/*
 * A labelled text input. The outreach forms had grown five copies of the same
 * ad-hoc `inputClass` string with no hint, error or `aria-describedby`
 * handling, so a rejected value could only be reported as a toast that
 * vanished before the user got back to the field it was about.
 */
export function Field({ id, label, hint, error, className, ...props }: FieldProps) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>

      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={cn(hint && hintId, error && errorId) || undefined}
        className={cn(
          "min-h-11 w-full rounded-md border bg-surface px-3 text-sm text-ink",
          "transition-[border-color,box-shadow] duration-200 ease-out",
          "placeholder:text-ink-faint",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
          error ? "border-danger" : "border-border-strong hover:border-ink-faint",
          className,
        )}
        {...props}
      />

      {hint && !error && (
        <p id={hintId} className="text-xs text-ink-faint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
