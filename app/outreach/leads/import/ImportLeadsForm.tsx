"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dropzone } from "@/components/shared/Dropzone";
import { Button } from "@/components/shared/Button";
import { useUIStore } from "@/store/uiStore";
import { parseCsv, type ParsedFile } from "@/lib/file-parsing/csv";
import { detectFormat, genericColumns, type LeadFormat } from "@/lib/leads/mapping";

const MAX_ROWS = 5000;

const FORMAT_LABELS: Record<LeadFormat, string> = {
  gmaps: "Google Maps scraper export",
  scout: "Scout export",
  generic: "Generic CSV",
};

/** Plain-language list of which columns a generic CSV will be read from. */
function describeGenericColumns(headers: string[]): string {
  const columns = genericColumns(headers);
  const used = [
    columns.company && `business name from "${columns.company}"`,
    !columns.company && columns.name && `name from "${columns.name}"`,
    columns.email && `email from "${columns.email}"`,
    columns.website && `website from "${columns.website}"`,
    columns.phone && `phone from "${columns.phone}"`,
  ].filter(Boolean);
  return used.length > 0 ? `Reading ${used.join(", ")}.` : "No recognizable name, email or website column was found.";
}

export function ImportLeadsForm() {
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const showToast = useUIStore((state) => state.showToast);

  const format = parsed ? detectFormat(parsed.headers) : null;
  const tooLarge = (parsed?.rows.length ?? 0) > MAX_ROWS;

  const handleFile = async (file: File) => {
    setStatus("uploading");
    try {
      setParsed(await parseCsv(file));
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  };

  const handleImport = async () => {
    if (!parsed || !format) return;
    setLoading(true);
    try {
      const response = await fetch("/api/outreach/leads/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headers: parsed.headers, rows: parsed.rows, format }),
      });
      const body = await response.json();
      if (!response.ok) {
        showToast("error", "Import failed. Check the file and try again.");
        return;
      }
      showToast(
        "success",
        `Imported ${body.added} new lead${body.added === 1 ? "" : "s"}, merged ${body.merged} into existing ones. ${body.skipped} rows skipped (no email, website or phone).`,
      );
      router.push("/outreach/leads");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Dropzone
        accept=".csv"
        status={status}
        onFileSelected={handleFile}
        helperText="CSV, up to 5,000 rows."
        errorMessage="Could not read that file as CSV."
      />

      {parsed && format && (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
          <p className="text-sm text-ink">
            Detected: <span className="font-medium">{FORMAT_LABELS[format]}</span> · {parsed.rows.length} rows
          </p>
          {format === "generic" && <p className="text-sm text-ink-muted">{describeGenericColumns(parsed.headers)}</p>}
          {tooLarge && (
            <p className="text-sm text-danger">This file has more than 5,000 rows. Split it and import the parts.</p>
          )}
          <Button loading={loading} disabled={tooLarge} onClick={handleImport} className="self-start">
            Import {parsed.rows.length} rows
          </Button>
        </div>
      )}
    </div>
  );
}
