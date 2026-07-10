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

/** Architecture / flow diagram (Mermaid source). Schema v3+. */
export interface ReportDiagram {
  title: string;
  caption?: string;
  mermaid: string;
}

/** Bird's-eye narrative of the PR (schema v2+). Optional for older reports. */
export interface PrOverview {
  headline: string;
  body: string;
  majorDecisions: string[];
  areas: string[];
  /** Present on schema v3+. */
  diagrams?: ReportDiagram[];
}

export interface ChangeStats {
  filesChanged: number;
  additions: number;
  deletions: number;
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
  /** Present on schema v2+ reports generated with the overview step. */
  overview?: PrOverview;
  /** Present on schema v3+ for the stats strip / charts. */
  changeStats?: ChangeStats;
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
  /** null while GitHub is still computing mergeability. */
  mergeable: boolean | null;
  rebaseable: boolean | null;
  /** dirty | blocked | clean | unstable | behind | draft | unknown … */
  mergeableState: string;
  allowMergeCommit: boolean;
  allowSquashMerge: boolean;
  allowRebaseMerge: boolean;
  baseRef: string;
  headRef: string;
  /** Used to fetch whole-file contents for full-context diffs. */
  baseSha: string;
  headSha: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  commits: number;
  createdAt: string;
  updatedAt: string;
  htmlUrl: string;
}

/** Client-side draft of an inline review comment before the review is submitted. */
export interface DraftReviewComment {
  id: string;
  path: string;
  line: number;
  side: "LEFT" | "RIGHT";
  body: string;
}

/** An inline review comment on a diff line (includes Code Beat's own posted comments). */
export interface ReviewComment {
  id: number;
  path: string;
  line: number;
  /** LEFT = the base (deleted) side, RIGHT = the head (added) side. */
  side: "LEFT" | "RIGHT";
  body: string;
  author: string;
  authorAvatar?: string;
  createdAt: string;
  htmlUrl: string;
}

/** A commit on the pull request. */
export interface PullCommit {
  sha: string;
  message: string;
  author: string;
  authorAvatar?: string;
  committedAt: string;
  htmlUrl: string;
}

/** A conversation (issue) comment on the PR — not an inline review comment. */
export interface IssueComment {
  id: number;
  author: string;
  authorAvatar?: string;
  body: string;
  createdAt: string;
  htmlUrl: string;
}

/** A submitted PR review (approve / request changes / comment). */
export interface PullReview {
  id: number;
  author: string;
  authorAvatar?: string;
  state: string;
  body: string;
  submittedAt: string;
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
