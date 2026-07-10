import type { getOctokit } from "@actions/github";
import {
  REPORT_SCHEMA_VERSION,
  reportSchema,
  type PrOverview,
  type Report,
  type ReportFinding
} from "./report-schema.js";
import type { ReviewFinding } from "./schema.js";
import type { ValidatedReview } from "./review.js";

type Octokit = ReturnType<typeof getOctokit>;

export interface BuildReportArgs {
  toolName: string;
  toolVersion: string;
  generatedAt?: string;
  owner: string;
  repo: string;
  model: string;
  pullRequest: {
    number: number;
    title: string;
    author: string;
    baseRef: string;
    headRef: string;
    baseSha: string;
    headSha: string;
  };
  /** Bird's-eye narrative of the PR (purpose, approach, major decisions). */
  overview: PrOverview;
  review: ValidatedReview;
}

/**
 * Build the typed report.json payload from a completed review + PR overview.
 * Pure: no I/O. Every finding in the review result is included, flagged with
 * whether it was posted as an inline comment.
 */
export function buildReport(args: BuildReportArgs): Report {
  const postedKeys = new Set(args.review.comments.map(findingKey));
  const findings: ReportFinding[] = args.review.result.findings.map((finding) => ({
    ...finding,
    posted: postedKeys.has(findingKey(finding))
  }));

  const report: Report = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    tool: { name: args.toolName, version: args.toolVersion },
    repo: { owner: args.owner, name: args.repo },
    pullRequest: {
      number: args.pullRequest.number,
      title: args.pullRequest.title,
      author: args.pullRequest.author,
      baseRef: args.pullRequest.baseRef,
      headRef: args.pullRequest.headRef,
      baseSha: args.pullRequest.baseSha,
      headSha: args.pullRequest.headSha
    },
    overview: args.overview,
    review: {
      score: args.review.result.score,
      summary: args.review.result.summary,
      model: args.model,
      truncatedDiff: args.review.truncatedDiff,
      skippedCommentCount: args.review.skippedCommentCount,
      findings
    }
  };

  // Validate our own output so a schema drift fails loudly instead of shipping a bad report.
  return reportSchema.parse(report);
}

function findingKey(finding: ReviewFinding): string {
  return `${finding.path}:${finding.line}:${finding.title}`;
}

/** Path of the report inside the report branch. Per-PR-latest; overwritten each run. */
export function reportPath(prNumber: number): string {
  return `reports/pr-${prNumber}/report.json`;
}

/**
 * Deterministic viewer URL for a PR. Returns undefined when no base URL is
 * configured (report link disabled).
 */
export function buildViewerUrl(
  baseUrl: string,
  owner: string,
  repo: string,
  prNumber: number
): string | undefined {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return undefined;
  }

  return `${trimmed}/${owner}/${repo}/pull/${prNumber}`;
}

export interface PublishReportResult {
  ok: boolean;
  commitSha?: string;
  error?: string;
}

/**
 * Commit report.json to an orphan report branch, best-effort. Never throws: a
 * report failure must not fail the review. Creates the branch as an orphan on
 * first run (no shared history with code), then updates just the file thereafter.
 */
export async function publishReport(
  octokit: Octokit,
  args: { owner: string; repo: string; branch: string; report: Report }
): Promise<PublishReportResult> {
  const { owner, repo, branch } = args;
  const path = reportPath(args.report.pullRequest.number);
  const content = `${JSON.stringify(args.report, null, 2)}\n`;
  const message = `Code Beat report for #${args.report.pullRequest.number} (${args.report.pullRequest.headSha.slice(0, 7)})`;

  try {
    const blob = await octokit.rest.git.createBlob({
      owner,
      repo,
      content,
      encoding: "utf-8"
    });

    const existingHead = await getBranchHead(octokit, owner, repo, branch);

    const tree = await octokit.rest.git.createTree({
      owner,
      repo,
      tree: [{ path, mode: "100644", type: "blob", sha: blob.data.sha }],
      // No base_tree on first commit => orphan branch containing only reports.
      ...(existingHead ? { base_tree: existingHead.treeSha } : {})
    });

    const commit = await octokit.rest.git.createCommit({
      owner,
      repo,
      message,
      tree: tree.data.sha,
      parents: existingHead ? [existingHead.commitSha] : []
    });

    if (existingHead) {
      await octokit.rest.git.updateRef({
        owner,
        repo,
        ref: `heads/${branch}`,
        sha: commit.data.sha,
        force: true
      });
    } else {
      await octokit.rest.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${branch}`,
        sha: commit.data.sha
      });
    }

    console.log(`Code Beat report published to ${branch}:${path} at ${commit.data.sha}`);
    return { ok: true, commitSha: commit.data.sha };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(`::warning::Could not publish Code Beat report: ${errorMessage}`);
    return { ok: false, error: errorMessage };
  }
}

async function getBranchHead(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string
): Promise<{ commitSha: string; treeSha: string } | undefined> {
  try {
    const ref = await octokit.rest.git.getRef({ owner, repo, ref: `heads/${branch}` });
    const commitSha = ref.data.object.sha;
    const commit = await octokit.rest.git.getCommit({ owner, repo, commit_sha: commitSha });
    return { commitSha, treeSha: commit.data.tree.sha };
  } catch (error) {
    if (isNotFound(error)) {
      return undefined;
    }

    throw error;
  }
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "status" in error && (error as { status: number }).status === 404;
}
