import type { Report, ViewerFile } from "./types";

export interface LoadedReport {
  report: Report;
  files: ViewerFile[];
}

export class ApiError extends Error {
  constructor(public status: number) {
    super(`API ${status}`);
    this.name = "ApiError";
  }
}

/**
 * Fetch the report + diff from our own Worker (which proxies GitHub server-side with the
 * signed-in visitor's token). No GitHub token ever reaches the browser.
 */
export async function fetchReport(owner: string, repo: string, number: number): Promise<LoadedReport> {
  const res = await fetch(`/api/report/${owner}/${repo}/${number}`, { credentials: "include" });
  if (!res.ok) {
    throw new ApiError(res.status);
  }
  return (await res.json()) as LoadedReport;
}
