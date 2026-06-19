import * as github from "@actions/github";
import { getInput, setFailed, setOutput } from "./action-core.js";
import { formatInlineComment, formatReviewBody } from "./format.js";
import { reviewPullRequest } from "./review.js";
import type { PullRequestFile } from "./diff.js";

type Octokit = ReturnType<typeof github.getOctokit>;

async function run(): Promise<void> {
  let cleanupProcessingReaction: (() => Promise<void>) | undefined;

  try {
    const pullRequest = github.context.payload.pull_request;
    if (!pullRequest) {
      setFailed("Code Beat only runs on pull_request events.");
      return;
    }

    const apiKey = getInput("openrouter-api-key", { required: true });
    const model = getInput("model") || "deepseek/deepseek-v4-flash";
    const token = getInput("github-token") || process.env.GITHUB_TOKEN;
    if (!token) {
      setFailed("A GitHub token is required. Pass github-token or set GITHUB_TOKEN.");
      return;
    }

    const maxComments = parseIntegerInput("max-comments", 12);
    const reviewRuns = parseIntegerInput("review-runs", 2);
    const codeQualityRuns = parseIntegerInput("code-quality-runs", 2);
    const failOnScoreBelow = parseOptionalNumberInput("fail-on-score-below");
    const octokit = github.getOctokit(token);
    const { owner, repo } = github.context.repo;
    const prNumber = pullRequest.number;

    const processingReactionId = await addIssueReaction(octokit, owner, repo, prNumber, "eyes");
    cleanupProcessingReaction = () => removeIssueReaction(octokit, owner, repo, prNumber, processingReactionId, "eyes");

    const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100
    });
    const [issueComments, reviewComments] = await Promise.all([
      octokit.paginate(octokit.rest.issues.listComments, {
        owner,
        repo,
        issue_number: prNumber,
        per_page: 100
      }),
      octokit.paginate(octokit.rest.pulls.listReviewComments, {
        owner,
        repo,
        pull_number: prNumber,
        per_page: 100
      })
    ]);

    const review = await reviewPullRequest({
      apiKey,
      model,
      owner,
      repo,
      prNumber,
      title: pullRequest.title,
      body: pullRequest.body ?? "",
      author: pullRequest.user?.login ?? "unknown",
      baseRef: pullRequest.base.ref,
      headRef: pullRequest.head.ref,
      files: files.map(toPullRequestFile),
      comments: {
        issueComments: issueComments.map((comment) => ({
          author: comment.user?.login ?? "unknown",
          body: comment.body ?? "",
          createdAt: comment.created_at
        })),
        reviewComments: reviewComments.map((comment) => ({
          author: comment.user?.login ?? "unknown",
          body: comment.body ?? "",
          path: comment.path,
          line: comment.line ?? undefined,
          createdAt: comment.created_at
        }))
      },
      maxComments,
      reviewRuns,
      codeQualityRuns,
      workspaceRoot: process.env.GITHUB_WORKSPACE ?? process.cwd()
    });

    const body = formatReviewBody({
      result: review.result,
      postedComments: review.comments,
      skippedCommentCount: review.skippedCommentCount,
      truncatedDiff: review.truncatedDiff
    });

    if (review.comments.length > 0) {
      await octokit.rest.pulls.createReview({
        owner,
        repo,
        pull_number: prNumber,
        event: "COMMENT",
        body,
        comments: review.comments.map((comment) => ({
          path: comment.path,
          line: comment.line,
          side: "RIGHT",
          body: formatInlineComment(comment)
        }))
      });
    } else {
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body
      });
    }

    await cleanupProcessingReaction();
    cleanupProcessingReaction = undefined;

    if (review.result.score >= 5) {
      await addIssueReaction(octokit, owner, repo, prNumber, "+1");
    }

    setOutput("score", String(review.result.score));
    setOutput("summary", review.result.summary);
    setOutput("inline-comments", String(review.comments.length));

    if (failOnScoreBelow !== undefined && review.result.score < failOnScoreBelow) {
      setFailed(`Code Beat score ${review.result.score}/5 is below threshold ${failOnScoreBelow}.`);
    }
  } catch (error) {
    await cleanupProcessingReaction?.();
    setFailed(error instanceof Error ? error.message : String(error));
  }
}

function toPullRequestFile(file: {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}): PullRequestFile {
  return {
    filename: file.filename,
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
    changes: file.changes,
    patch: file.patch
  };
}

async function addIssueReaction(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number,
  content: "eyes" | "+1"
): Promise<number | undefined> {
  try {
    const response = await octokit.rest.reactions.createForIssue({
      owner,
      repo,
      issue_number: issueNumber,
      content
    });
    return response.data.id;
  } catch (error) {
    console.warn(`::warning::Could not add ${content} reaction to pull request: ${formatError(error)}`);
    return undefined;
  }
}

async function removeIssueReaction(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number,
  reactionId: number | undefined,
  content: "eyes" | "+1"
): Promise<void> {
  if (reactionId === undefined) {
    return;
  }

  try {
    await octokit.rest.reactions.deleteForIssue({
      owner,
      repo,
      issue_number: issueNumber,
      reaction_id: reactionId
    });
  } catch (error) {
    console.warn(`::warning::Could not remove ${content} reaction from pull request: ${formatError(error)}`);
  }
}

function parseIntegerInput(name: string, fallback: number): number {
  const value = getInput(name);
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }

  return parsed;
}

function parseOptionalNumberInput(name: string): number | undefined {
  const value = getInput(name);
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 5) {
    throw new Error(`${name} must be a number between 0 and 5.`);
  }

  return parsed;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

void run();
