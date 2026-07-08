import type { PullDetail, PullSummary, RepoSummary, Report, ReviewComment, ViewerFile } from "./types";

export interface PullViewData {
  pull: PullDetail;
  files: ViewerFile[];
  /** null when Code Beat hasn't reviewed this PR yet. */
  report: Report | null;
  comments: ReviewComment[];
}

export class ApiError extends Error {
  constructor(public status: number) {
    super(`API ${status}`);
    this.name = "ApiError";
  }
}

/**
 * Fetch the PR, its diff, and its report from our own Worker (which proxies GitHub
 * server-side with the signed-in visitor's token). No GitHub token reaches the browser.
 */
export async function fetchPullView(owner: string, repo: string, number: number): Promise<PullViewData> {
  const res = await fetch(`/api/pr/${owner}/${repo}/${number}`, { credentials: "include" });
  if (!res.ok) {
    throw new ApiError(res.status);
  }
  return (await res.json()) as PullViewData;
}

/** Fetch a file's whole contents at a ref (for full-context diffs). */
export async function fetchFileContents(
  owner: string,
  repo: string,
  path: string,
  ref: string,
): Promise<string> {
  const query = new URLSearchParams({ path, ref });
  const res = await fetch(`/api/file/${owner}/${repo}?${query}`, { credentials: "include" });
  if (!res.ok) {
    throw new ApiError(res.status);
  }
  const body = (await res.json()) as { contents: string };
  return body.contents;
}

/** Fetch open pull requests for a repo. */
export async function fetchOpenPulls(owner: string, repo: string): Promise<PullSummary[]> {
  const res = await fetch(`/api/pulls/${owner}/${repo}`, { credentials: "include" });
  if (!res.ok) {
    throw new ApiError(res.status);
  }
  const body = (await res.json()) as { pulls: PullSummary[] };
  return body.pulls;
}

/** Fetch the repos the user can reach (scoped to Code Beat installations). */
export async function fetchRepos(): Promise<RepoSummary[]> {
  const res = await fetch("/api/repos", { credentials: "include" });
  if (!res.ok) {
    throw new ApiError(res.status);
  }
  const body = (await res.json()) as { repos: RepoSummary[] };
  return body.repos;
}
