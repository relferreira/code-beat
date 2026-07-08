import type { PullDetail, PullSummary, RepoSummary, Report, ViewerFile } from "../report/types";

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

interface PullDetailResponse {
  number: number;
  title: string;
  body: string | null;
  state: string;
  draft?: boolean;
  merged?: boolean;
  user?: { login?: string; avatar_url?: string } | null;
  base: { ref: string };
  head: { ref: string };
  additions: number;
  deletions: number;
  changed_files: number;
  commits: number;
  created_at: string;
  updated_at: string;
  html_url: string;
}

async function getPullRequest(ref: RepoRef, token: string): Promise<PullDetail> {
  const res = await ghFetch(`/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}`, token);
  const pr = (await res.json()) as PullDetailResponse;
  return {
    number: pr.number,
    title: pr.title,
    body: pr.body ?? "",
    author: pr.user?.login ?? "unknown",
    authorAvatar: pr.user?.avatar_url,
    state: pr.state === "closed" ? "closed" : "open",
    merged: Boolean(pr.merged),
    draft: Boolean(pr.draft),
    baseRef: pr.base.ref,
    headRef: pr.head.ref,
    additions: pr.additions,
    deletions: pr.deletions,
    changedFiles: pr.changed_files,
    commits: pr.commits,
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
    htmlUrl: pr.html_url,
  };
}

export interface PullViewData {
  pull: PullDetail;
  files: ViewerFile[];
  /** null when Code Beat hasn't reviewed this PR yet — the PR tab still renders. */
  report: Report | null;
}

/**
 * Everything the PR viewer needs, in one round trip. A missing report is not an error:
 * the GitHub-style PR tab must work for un-reviewed PRs.
 */
export async function loadPullView(ref: RepoRef, token: string): Promise<PullViewData> {
  const [pull, files, report] = await Promise.all([
    getPullRequest(ref, token),
    fetchPullFiles(ref, token),
    fetchReport(ref, token).catch((error: unknown) => {
      if (error instanceof GitHubError && error.status === 404) return null;
      throw error;
    }),
  ]);
  return { pull, files, report };
}

interface RepoListResponse {
  name: string;
  full_name: string;
  private: boolean;
  pushed_at: string | null;
  owner: { login: string };
}

/**
 * Repos the signed-in user can reach, most-recently-pushed first. A GitHub App user token is
 * scoped to accounts where the app is installed, so this spans every org with Code Beat
 * installed — and nothing beyond it. Bounded to 3 pages (300 repos) to stay well under
 * Cloudflare's per-request subrequest limit.
 */
export async function listUserRepos(token: string): Promise<RepoSummary[]> {
  const repos: RepoSummary[] = [];
  for (let page = 1; page <= 3; page += 1) {
    const res = await ghFetch(`/user/repos?sort=pushed&direction=desc&per_page=100&page=${page}`, token);
    const batch = (await res.json()) as RepoListResponse[];
    for (const repo of batch) {
      repos.push({
        owner: repo.owner.login,
        name: repo.name,
        fullName: repo.full_name,
        private: repo.private,
        pushedAt: repo.pushed_at,
      });
    }
    if (batch.length < 100) break;
  }
  return repos;
}

interface PullListResponse {
  number: number;
  title: string;
  user?: { login?: string } | null;
  updated_at: string;
  draft?: boolean;
}

/** List a repo's open pull requests, most-recently-updated first (for the sidebar). */
export async function listOpenPulls(owner: string, repo: string, token: string): Promise<PullSummary[]> {
  const res = await ghFetch(
    `/repos/${owner}/${repo}/pulls?state=open&per_page=100&sort=updated&direction=desc`,
    token,
  );
  const batch = (await res.json()) as PullListResponse[];
  return batch.map((pr) => ({
    number: pr.number,
    title: pr.title,
    author: pr.user?.login ?? "unknown",
    updatedAt: pr.updated_at,
    draft: Boolean(pr.draft),
  }));
}
