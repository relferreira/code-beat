// Mirrors the action's report-schema (src/report-schema.ts). Kept as a local copy for
// now; will be extracted to a shared package alongside the monorepo move.

export type Severity = "blocker" | "major" | "minor";

export interface ReportFinding {
  path: string;
  line: number;
  severity: Severity;
  title: string;
  body: string;
  posted: boolean;
}

export interface Report {
  schemaVersion: number;
  generatedAt: string;
  tool: { name: string; version: string };
  repo: { owner: string; name: string };
  pullRequest: {
    number: number;
    title: string;
    author: string;
    baseRef: string;
    headRef: string;
    baseSha: string;
    headSha: string;
  };
  review: {
    score: number;
    summary: string;
    model: string;
    truncatedDiff: boolean;
    skippedCommentCount: number;
    findings: ReportFinding[];
  };
}

/**
 * A changed file plus its unified diff patch. Fetched from GitHub's `pulls/{n}/files`
 * API; `patch` is passed straight to @pierre/diffs.
 */
export interface ViewerFile {
  path: string;
  status: string;
  patch: string;
}

/** Full pull request detail, for the GitHub-style PR tab. */
export interface PullDetail {
  number: number;
  title: string;
  body: string;
  author: string;
  authorAvatar?: string;
  state: "open" | "closed";
  merged: boolean;
  draft: boolean;
  baseRef: string;
  headRef: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  commits: number;
  createdAt: string;
  updatedAt: string;
  htmlUrl: string;
}

/** One open pull request, for the sidebar list. */
export interface PullSummary {
  number: number;
  title: string;
  author: string;
  updatedAt: string;
  draft: boolean;
}

/**
 * A repository the viewer can reach. Note: a GitHub App user token is scoped to accounts
 * where the app is installed, so this only ever lists Code Beat-installed repos.
 */
export interface RepoSummary {
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  pushedAt: string | null;
}

/** A feed entry: an open PR, tagged with the repo it belongs to. */
export interface FeedItem {
  owner: string;
  repo: string;
  pull: PullSummary;
}
