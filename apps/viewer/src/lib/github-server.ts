import type {
  IssueComment,
  PullCommit,
  PullDetail,
  PullReview,
  PullSummary,
  RepoSummary,
  Report,
  ReviewComment,
  ViewerFile,
} from "../report/types";

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

async function ghFetch(path: string, token: string, accept = "application/vnd.github+json"): Promise<Response> {
  const res = await fetch(`${API}${path}`, {
    headers: {
      Accept: accept,
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

/**
 * Whole-file contents at a ref, as raw text. Returns "" when the file doesn't exist at that
 * ref (added files have no base version; removed files have no head version).
 */
export async function getFileContents(
  owner: string,
  repo: string,
  path: string,
  ref: string,
  token: string,
): Promise<string> {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  try {
    const res = await ghFetch(
      `/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`,
      token,
      "application/vnd.github.raw",
    );
    return await res.text();
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404) return "";
    throw error;
  }
}

interface ReviewCommentResponse {
  id: number;
  path: string;
  line: number | null;
  original_line: number | null;
  side: string | null;
  body: string;
  user?: { login?: string; avatar_url?: string } | null;
  created_at: string;
  html_url: string;
}

/** Inline review comments on the PR's diff lines. Includes Code Beat's own posted comments. */
async function listReviewComments(ref: RepoRef, token: string): Promise<ReviewComment[]> {
  const comments: ReviewComment[] = [];
  for (let page = 1; page <= 5; page += 1) {
    const res = await ghFetch(
      `/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}/comments?per_page=100&page=${page}`,
      token,
    );
    const batch = (await res.json()) as ReviewCommentResponse[];
    for (const comment of batch) {
      // `line` is null for comments whose lines are no longer in the diff; fall back to the
      // line they were originally left on, and skip file-level comments entirely.
      const line = comment.line ?? comment.original_line;
      if (line == null) continue;
      comments.push({
        id: comment.id,
        path: comment.path,
        line,
        side: comment.side === "LEFT" ? "LEFT" : "RIGHT",
        body: comment.body,
        author: comment.user?.login ?? "unknown",
        authorAvatar: comment.user?.avatar_url,
        createdAt: comment.created_at,
        htmlUrl: comment.html_url,
      });
    }
    if (batch.length < 100) break;
  }
  return comments;
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
  base: { ref: string; sha: string };
  head: { ref: string; sha: string };
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
    baseSha: pr.base.sha,
    headSha: pr.head.sha,
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
  /** null when Code Beat hasn't reviewed this PR yet — conversation + files still render. */
  report: Report | null;
  /** Inline review comments for the Files tab. */
  comments: ReviewComment[];
  commits: PullCommit[];
  issueComments: IssueComment[];
  reviews: PullReview[];
}

/**
 * Everything the PR viewer needs, in one round trip. A missing report is not an error:
 * conversation and files tabs must work for un-reviewed PRs.
 */
export async function loadPullView(ref: RepoRef, token: string): Promise<PullViewData> {
  const [pull, files, report, comments, commits, issueComments, reviews] = await Promise.all([
    getPullRequest(ref, token),
    fetchPullFiles(ref, token),
    fetchReport(ref, token).catch((error: unknown) => {
      if (error instanceof GitHubError && error.status === 404) return null;
      throw error;
    }),
    // Conversation extras are a nicety: never fail the whole view over them.
    listReviewComments(ref, token).catch(() => [] as ReviewComment[]),
    listPullCommits(ref, token).catch(() => [] as PullCommit[]),
    listIssueComments(ref, token).catch(() => [] as IssueComment[]),
    listPullReviews(ref, token).catch(() => [] as PullReview[]),
  ]);
  return { pull, files, report, comments, commits, issueComments, reviews };
}

interface CommitResponse {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author?: { name?: string; date?: string } | null;
    committer?: { date?: string } | null;
  };
  author?: { login?: string; avatar_url?: string } | null;
  committer?: { login?: string; avatar_url?: string } | null;
}

async function listPullCommits(ref: RepoRef, token: string): Promise<PullCommit[]> {
  const commits: PullCommit[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const res = await ghFetch(
      `/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}/commits?per_page=100&page=${page}`,
      token,
    );
    const batch = (await res.json()) as CommitResponse[];
    for (const commit of batch) {
      const message = commit.commit.message ?? "";
      commits.push({
        sha: commit.sha,
        message,
        author: commit.author?.login ?? commit.commit.author?.name ?? "unknown",
        authorAvatar: commit.author?.avatar_url ?? commit.committer?.avatar_url,
        committedAt: commit.commit.author?.date ?? commit.commit.committer?.date ?? "",
        htmlUrl: commit.html_url,
      });
    }
    if (batch.length < 100) break;
  }
  return commits;
}

interface IssueCommentResponse {
  id: number;
  body: string;
  user?: { login?: string; avatar_url?: string } | null;
  created_at: string;
  html_url: string;
}

async function listIssueComments(ref: RepoRef, token: string): Promise<IssueComment[]> {
  const comments: IssueComment[] = [];
  for (let page = 1; page <= 5; page += 1) {
    const res = await ghFetch(
      `/repos/${ref.owner}/${ref.repo}/issues/${ref.number}/comments?per_page=100&page=${page}`,
      token,
    );
    const batch = (await res.json()) as IssueCommentResponse[];
    for (const comment of batch) {
      comments.push({
        id: comment.id,
        author: comment.user?.login ?? "unknown",
        authorAvatar: comment.user?.avatar_url,
        body: comment.body,
        createdAt: comment.created_at,
        htmlUrl: comment.html_url,
      });
    }
    if (batch.length < 100) break;
  }
  return comments;
}

interface ReviewResponse {
  id: number;
  body: string | null;
  state: string;
  user?: { login?: string; avatar_url?: string } | null;
  submitted_at: string | null;
  html_url: string;
}

async function listPullReviews(ref: RepoRef, token: string): Promise<PullReview[]> {
  const reviews: PullReview[] = [];
  for (let page = 1; page <= 5; page += 1) {
    const res = await ghFetch(
      `/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}/reviews?per_page=100&page=${page}`,
      token,
    );
    const batch = (await res.json()) as ReviewResponse[];
    for (const review of batch) {
      // PENDING reviews have no submission timestamp and clutter the timeline.
      if (!review.submitted_at) continue;
      reviews.push({
        id: review.id,
        author: review.user?.login ?? "unknown",
        authorAvatar: review.user?.avatar_url,
        state: review.state,
        body: review.body ?? "",
        submittedAt: review.submitted_at,
        htmlUrl: review.html_url,
      });
    }
    if (batch.length < 100) break;
  }
  return reviews;
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
