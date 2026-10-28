"use client";

import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { Counter } from "@/components/shared/Counter";
import { countNonBlankLines } from "@/lib/validation/lineCount";

export interface TextareaProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "id" | "value" | "onChange"
> {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
  errorMessage?: string;
  hideCount?: boolean;
  hideLabel?: boolean;
  countLabel?: (count: number) => string;
}

export function Textarea({
  id,
  label,
  value,
  onChange,
  error = false,
  errorMessage,
  hideCount = false,
  hideLabel = false,
  countLabel = (count) => `${count} ${count === 1 ? "keyword" : "keywords"}`,
  className,
  rows = 10,
  ...props
}: TextareaProps) {
  const count = countNonBlankLines(value);
  const errorId = `${id}-error`;
  const countId = `${id}-count`;

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className={cn("text-sm font-medium text-ink", hideLabel && "sr-only")}
      >
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error || undefined}
        aria-describedby={cn(
          !hideCount && countId,
          error && errorMessage && errorId,
        )}
        className={cn(
          "w-full rounded-md border bg-surface px-3 py-2 font-mono text-sm leading-relaxed text-ink",
          "transition-[border-color,box-shadow] duration-200 ease-out",
          "placeholder:text-ink-faint",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
          error
            ? "border-danger"
            : "border-border-strong hover:border-ink-faint",
          className,
        )}
        {...props}
      />
      {!hideCount && (
        <Counter state="neutral">
          <span id={countId}>{countLabel(count)}</span>
        </Counter>
      )}
      {error && errorMessage && (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
