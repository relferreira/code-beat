import type { Report, ViewerFile } from "../report/types";

// Server-side GitHub client. Runs on the Worker with the visitor's server-held token, so
// repo content is a stateless pass-through and no GitHub token reaches the browser.

const API = "https://api.github.com";
const REPORT_BRANCH = "code-beat-reports";
// GitHub's API rejects server-to-server requests without a User-Agent.
const USER_AGENT = "code-beat-viewer";

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

async function ghFetch(path: string, token: string): Promise<Response> {
  const res = await fetch(`${API}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": USER_AGENT,
      Authorization: `Bearer ${token}`,
    },
  });
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

async function fetchReport(ref: RepoRef, token: string): Promise<Report> {
  const path = `/repos/${ref.owner}/${ref.repo}/contents/reports/pr-${ref.number}/report.json?ref=${REPORT_BRANCH}`;
  const res = await ghFetch(path, token);
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

/**
 * GitHub's pulls/files `patch` is only the hunks — it omits the diff header that
 * @pierre/diffs needs. Reconstruct a complete single-file unified diff.
 */
function toSingleFileDiff(path: string, status: string, patch: string): string {
  if (!patch) {
    return "";
  }
  if (patch.startsWith("diff --git")) {
    return patch;
  }
  const from = status === "added" ? "/dev/null" : `a/${path}`;
  const to = status === "removed" ? "/dev/null" : `b/${path}`;
  return `diff --git a/${path} b/${path}\n--- ${from}\n+++ ${to}\n${patch}`;
}

async function fetchPullFiles(ref: RepoRef, token: string): Promise<ViewerFile[]> {
  const files: ViewerFile[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const path = `/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}/files?per_page=100&page=${page}`;
    const res = await ghFetch(path, token);
    const batch = (await res.json()) as PullFileResponse[];
    for (const file of batch) {
      files.push({
        path: file.filename,
        status: file.status,
        patch: toSingleFileDiff(file.filename, file.status, file.patch ?? ""),
      });
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

export async function loadReport(ref: RepoRef, token: string): Promise<LoadedReport> {
  // Report first: a 404 here is the meaningful "not published yet" signal.
  const report = await fetchReport(ref, token);
  const files = await fetchPullFiles(ref, token);
  return { report, files };
}
