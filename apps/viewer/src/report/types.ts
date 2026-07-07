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
 * A changed file plus its unified diff patch. In production this is fetched client-side
 * from GitHub's `pulls/{n}/files` API; `patch` is passed straight to @pierre/diffs.
 */
export interface ViewerFile {
  path: string;
  status: string;
  patch: string;
}
