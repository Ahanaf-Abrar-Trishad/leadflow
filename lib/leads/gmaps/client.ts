/**
 * Client for the gosom/google-maps-scraper engine's job API (the
 * gmaps-scraper service in docker-compose.yml). A scrape is an async job:
 * create it, poll until "ok", then download the CSV.
 */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface CreateJobInput {
  keyword: string;
  lat: string;
  lon: string;
  depth: number;
  collectEmails: boolean;
  maxTimeSeconds: number;
}

export type EngineJobStatus = "working" | "ok" | "failed" | "pending";

export function gmapsBaseUrl(): string {
  return process.env.GMAPS_SCRAPER_URL ?? "http://localhost:8080";
}

export class GmapsClient {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string = gmapsBaseUrl(),
    private readonly fetchImpl: FetchLike = fetch,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async createJob(input: CreateJobInput): Promise<string> {
    // Field names and types are the engine's: lat/lon as strings and max_time
    // in seconds are required, or it answers 422.
    const response = await this.fetchImpl(`${this.baseUrl}/api/v1/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: input.keyword.slice(0, 100),
        keywords: [input.keyword],
        lang: "en",
        zoom: 15,
        lat: input.lat,
        lon: input.lon,
        radius: 10000,
        fast_mode: false,
        depth: input.depth,
        email: input.collectEmails,
        max_time: input.maxTimeSeconds,
      }),
    });
    if (!response.ok) {
      throw new Error(`Scraper engine rejected the job (HTTP ${response.status}): ${await safeText(response)}`);
    }
    const body = (await response.json()) as { id?: string };
    if (!body.id) throw new Error("Scraper engine did not return a job id.");
    return body.id;
  }

  async getStatus(jobId: string): Promise<EngineJobStatus> {
    const response = await this.fetchImpl(`${this.baseUrl}/api/v1/jobs/${encodeURIComponent(jobId)}`);
    if (!response.ok) throw new Error(`Could not read scrape job status (HTTP ${response.status}).`);
    const body = (await response.json()) as { Status?: string; status?: string };
    return ((body.Status ?? body.status ?? "pending").toLowerCase() as EngineJobStatus);
  }

  async downloadCsv(jobId: string): Promise<string> {
    const response = await this.fetchImpl(`${this.baseUrl}/api/v1/jobs/${encodeURIComponent(jobId)}/download`);
    if (!response.ok) throw new Error(`Could not download scrape results (HTTP ${response.status}).`);
    return response.text();
  }

  /** Results live in the engine's volume until deleted; we keep our own copy. */
  async deleteJob(jobId: string): Promise<void> {
    await this.fetchImpl(`${this.baseUrl}/api/v1/jobs/${encodeURIComponent(jobId)}`, { method: "DELETE" });
  }
}

async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 300);
  } catch {
    return "";
  }
}
