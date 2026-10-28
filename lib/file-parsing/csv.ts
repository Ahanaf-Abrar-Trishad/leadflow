import Papa from "papaparse";

export interface ParsedFile {
  headers: string[];
  rows: Record<string, string>[];
}

export function parseCsv(file: File): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        resolve({
          headers: results.meta.fields ?? [],
          rows: results.data,
        });
      },
      error: (error: Error) => reject(error),
    });
  });
}
