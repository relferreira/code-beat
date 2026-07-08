import type { PullDetail, PullSummary, RepoSummary, Report, ViewerFile } from "./types";

export interface PullViewData {
  pull: PullDetail;
  files: ViewerFile[];
  /** null when Code Beat hasn't reviewed this PR yet. */
  report: Report | null;
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
