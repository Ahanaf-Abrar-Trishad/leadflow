"use client";

import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "onChange"
> {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: string;
}

export function Checkbox({
  id,
  label,
  checked,
  onChange,
  description,
  className,
  ...props
}: CheckboxProps) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex min-h-11 cursor-pointer items-start gap-2 text-sm text-ink",
        className,
      )}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 accent-signal"
        {...props}
      />
      <span>
        {label}
        {description && (
          <span className="block text-xs text-ink-muted">{description}</span>
        )}
      </span>
    </label>
  );
}
