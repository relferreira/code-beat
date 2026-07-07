import type { Report, ViewerFile } from "./types";

const API = "https://api.github.com";
const REPORT_BRANCH = "code-beat-reports";

export class GitHubError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

export interface RepoRef {
  owner: string;
  repo: string;
  number: number;
}

/**
 * Fetch options. `token` is optional today (public repos work unauthenticated); the auth
 * phase will pass the reviewer's short-lived GitHub token here without any other change.
 */
export interface FetchOpts {
  token?: string;
  branch?: string;
}

async function ghFetch(path: string, opts: FetchOpts, accept = "application/vnd.github+json"): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: accept,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (opts.token) {
    headers.Authorization = `Bearer ${opts.token}`;
  }

  const res = await fetch(`${API}${path}`, { headers });
  if (!res.ok) {
    throw new GitHubError(res.status, `GitHub ${res.status} for ${path}`);
  }
  return res;
}

function decodeBase64Utf8(b64: string): string {
  const binary = atob(b64.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Fetch report.json from the report branch. Throws GitHubError(404) when not published yet. */
export async function fetchReport(ref: RepoRef, opts: FetchOpts = {}): Promise<Report> {
  const branch = opts.branch ?? REPORT_BRANCH;
  const path = `/repos/${ref.owner}/${ref.repo}/contents/reports/pr-${ref.number}/report.json?ref=${branch}`;
  const res = await ghFetch(path, opts);
  const payload = (await res.json()) as { content?: string; encoding?: string };
  if (!payload.content || payload.encoding !== "base64") {
    throw new GitHubError(res.status, "Unexpected contents API response for report.json");
  }
  return JSON.parse(decodeBase64Utf8(payload.content)) as Report;
}

interface PullFileResponse {
  filename: string;
  status: string;
  patch?: string;
}

/** Fetch the PR's changed files (unified patches), following pagination. */
export async function fetchPullFiles(ref: RepoRef, opts: FetchOpts = {}): Promise<ViewerFile[]> {
  const files: ViewerFile[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const path = `/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}/files?per_page=100&page=${page}`;
    const res = await ghFetch(path, opts);
    const batch = (await res.json()) as PullFileResponse[];
    for (const file of batch) {
      files.push({ path: file.filename, status: file.status, patch: file.patch ?? "" });
    }
    if (batch.length < 100) {
      break;
    }
  }
  return files;
}

export interface LoadedReport {
  report: Report;
  files: ViewerFile[];
}

export async function loadReport(ref: RepoRef, opts: FetchOpts = {}): Promise<LoadedReport> {
  // Report first: a 404 here is the meaningful "not published yet" signal.
  const report = await fetchReport(ref, opts);
  const files = await fetchPullFiles(ref, opts);
  return { report, files };
}
