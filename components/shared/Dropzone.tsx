"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { cn } from "@/lib/cn";

export type DropzoneStatus = "idle" | "uploading" | "error";

export interface DropzoneProps {
  accept: string;
  onFileSelected: (file: File) => void;
  status?: DropzoneStatus;
  statusText?: string;
  errorMessage?: string;
  helperText?: string;
}

/**
 * Accepts drag-over from anywhere on the page, not just the box itself
 * (UX-DESIGN §6), to reduce the precision needed to hit a small target.
 * Click-to-browse remains the accessible/primary path.
 */
export function Dropzone({
  accept,
  onFileSelected,
  status = "idle",
  statusText,
  errorMessage,
  helperText,
}: DropzoneProps) {
  const [pageDragActive, setPageDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  useEffect(() => {
    const hasFiles = (event: DragEvent) =>
      Array.from(event.dataTransfer?.types ?? []).includes("Files");

    const handleDragEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      dragDepth.current += 1;
      setPageDragActive(true);
    };
    const handleDragLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setPageDragActive(false);
    };
    const handleDragOver = (event: DragEvent) => {
      if (hasFiles(event)) event.preventDefault();
    };
    const handleDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepth.current = 0;
      setPageDragActive(false);
      const file = event.dataTransfer?.files?.[0];
      if (file) onFileSelected(file);
    };

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);
    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
    };
  }, [onFileSelected]);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onFileSelected(file);
    event.target.value = "";
  };

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center",
        "transition-[border-color,background-color,scale] duration-200 ease-out",
        pageDragActive
          ? // Grows a hair as the file crosses the window - confirms the drop
            // will land here before the user lets go.
            "scale-[1.01] border-signal bg-signal-soft"
          : "border-border-strong bg-surface",
        status === "error" && "border-danger bg-danger-soft",
      )}
    >
      <p className="text-sm font-medium text-ink">
        Drag a file anywhere on the page, or{" "}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded-sm font-semibold text-signal underline underline-offset-2 transition-colors duration-200 ease-out hover:text-signal-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2"
        >
          browse
        </button>
      </p>
      <p className="text-xs text-ink-muted">
        {helperText ?? "Accepts .csv, .xls, .xlsx, .txt"}
      </p>
      {status === "uploading" && (
        <p role="status" className="text-xs text-ink-muted">
          {statusText ?? "Reading file…"}
        </p>
      )}
      {status === "error" && errorMessage && (
        <p role="alert" className="text-xs text-danger">
          {errorMessage}
        </p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleInputChange}
        className="sr-only"
        aria-label="Upload a search-terms file"
      />
    </div>
  );
}
