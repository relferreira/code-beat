import * as github from "@actions/github";
import { getInput, setFailed, setOutput } from "./action-core.js";
import { formatInlineComment, formatReviewBody } from "./format.js";
import { parseModelListValue } from "./model-list.js";
import { reviewPullRequest } from "./review.js";
import type { PullRequestFile } from "./diff.js";
import type { PullRequestReviewThreadContext } from "./review.js";

type Octokit = ReturnType<typeof github.getOctokit>;

async function run(): Promise<void> {
  let cleanupProcessingReaction: (() => Promise<void>) | undefined;
  let cleanupSuccessReaction: (() => Promise<void>) | undefined;
  let octokit: Octokit | undefined;
  let owner: string | undefined;
  let repo: string | undefined;
  let prNumber: number | undefined;

  try {
    const pullRequest = github.context.payload.pull_request;
    if (!pullRequest) {
      setFailed("Code Beat only runs on pull_request events.");
      return;
    }

    const apiKey = getInput("openrouter-api-key", { required: true });
    const model = getInput("model") || "deepseek/deepseek-v4-flash";
    const sharedModels = parseModelListInput("models");
    const reviewModels = parseModelListInput("review-models");
    const codeQualityModels = parseModelListInput("code-quality-models");
    const retryMaxAttempts = parseIntegerInput("retry-max-attempts", 3);
    const retryDelayMs = parseIntegerInput("retry-delay-ms", 1000);
    const retryBackoffFactor = parseOptionalPositiveNumberInput("retry-backoff-factor", 2);
    const token = getInput("github-token") || process.env.GITHUB_TOKEN;
    if (!token) {
      setFailed("A GitHub token is required. Pass github-token or set GITHUB_TOKEN.");
      return;
    }

    const maxComments = parseIntegerInput("max-comments", 12);
    const reviewRuns = parseIntegerInput("review-runs", 2);
    const codeQualityRuns = parseIntegerInput("code-quality-runs", 2);
    const failOnScoreBelow = parseOptionalNumberInput("fail-on-score-below");
    const client = github.getOctokit(token);
    octokit = client;
    const repoContext = github.context.repo;
    const repoOwner = repoContext.owner;
    const repoName = repoContext.repo;
    const number = pullRequest.number;
    owner = repoOwner;
    repo = repoName;
    prNumber = number;
    cleanupSuccessReaction = () => removeIssueReactionsByContent(client, repoOwner, repoName, number, "+1");
    console.log(
      `Code Beat start: ${repoOwner}/${repoName}#${number}, model=${model}, ` +
        `models=${formatModelList(sharedModels)}, review-models=${formatModelList(reviewModels)}, ` +
        `code-quality-models=${formatModelList(codeQualityModels)}, review-runs=${reviewRuns}, ` +
        `code-quality-runs=${codeQualityRuns}, max-comments=${maxComments}, retry-max-attempts=${retryMaxAttempts}, ` +
        `retry-delay-ms=${retryDelayMs}, retry-backoff-factor=${retryBackoffFactor}`
    );
    console.log(`Code Beat workspace: ${process.env.GITHUB_WORKSPACE ?? process.cwd()}`);

    const processingReactionId = await addIssueReaction(client, repoOwner, repoName, number, "eyes");
    cleanupProcessingReaction = () => removeIssueReaction(client, repoOwner, repoName, number, processingReactionId, "eyes");

    const fetchStartedAt = Date.now();
    console.log("Code Beat GitHub context fetch start");
    const files = await client.paginate(client.rest.pulls.listFiles, {
      owner: repoOwner,
      repo: repoName,
      pull_number: number,
      per_page: 100
    });
    const [issueComments, reviewComments, reviewThreads] = await Promise.all([
      client.paginate(client.rest.issues.listComments, {
        owner: repoOwner,
        repo: repoName,
        issue_number: number,
        per_page: 100
      }),
      client.paginate(client.rest.pulls.listReviewComments, {
        owner: repoOwner,
        repo: repoName,
        pull_number: number,
        per_page: 100
      }),
      fetchReviewThreads(client, repoOwner, repoName, number)
    ]);
    console.log(
      `Code Beat GitHub context fetch complete in ${Date.now() - fetchStartedAt}ms: ` +
        `${files.length} file(s), ${issueComments.length} issue comment(s), ${reviewComments.length} review comment(s), ` +
        `${reviewThreads.length} review thread(s)`
    );
    console.log(`Code Beat changed files summary: ${describeChangedFiles(files.map(toPullRequestFile))}`);
    console.log(`Code Beat conversation summary: ${describeConversation(issueComments, reviewComments, reviewThreads)}`);

    const reviewStartedAt = Date.now();
    console.log("Code Beat AI review start");
    const review = await reviewPullRequest({
      apiKey,
      model,
      reviewModels: reviewModels.length > 0 ? reviewModels : sharedModels,
      codeQualityModels: codeQualityModels.length > 0 ? codeQualityModels : sharedModels,
      retryPolicy: {
        maxAttempts: retryMaxAttempts,
        delayMs: retryDelayMs,
        backoffFactor: retryBackoffFactor
      },
      owner: repoOwner,
      repo: repoName,
      prNumber: number,
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
        })),
        reviewThreads
      },
      maxComments,
      reviewRuns,
      codeQualityRuns,
      workspaceRoot: process.env.GITHUB_WORKSPACE ?? process.cwd()
    });
    console.log(`Code Beat AI review complete in ${Date.now() - reviewStartedAt}ms`);

    const body = formatReviewBody({
      result: review.result,
      postedComments: review.comments,
      skippedCommentCount: review.skippedCommentCount,
      truncatedDiff: review.truncatedDiff
    });

    if (review.comments.length > 0) {
      console.log(`Code Beat posting PR review with ${review.comments.length} inline comment(s)`);
      await client.rest.pulls.createReview({
        owner: repoOwner,
        repo: repoName,
        pull_number: number,
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
      console.log("Code Beat posting summary issue comment with no inline comments");
      await client.rest.issues.createComment({
        owner: repoOwner,
        repo: repoName,
        issue_number: number,
        body
      });
    }

    await deleteFailureComment(client, repoOwner, repoName, number);
    await cleanupProcessingReaction();
    cleanupProcessingReaction = undefined;

    if (review.result.score >= 5) {
      await addIssueReaction(client, repoOwner, repoName, number, "+1");
    } else {
      await cleanupSuccessReaction();
    }
    console.log(`Code Beat complete: score=${review.result.score}, inline-comments=${review.comments.length}`);

    setOutput("score", String(review.result.score));
    setOutput("summary", review.result.summary);
    setOutput("inline-comments", String(review.comments.length));

    if (failOnScoreBelow !== undefined && review.result.score < failOnScoreBelow) {
      setFailed(`Code Beat score ${review.result.score}/5 is below threshold ${failOnScoreBelow}.`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await cleanupProcessingReaction?.();
    if (octokit && owner && repo && prNumber) {
      await upsertFailureComment(octokit, owner, repo, prNumber, message);
    }
    await cleanupSuccessReaction?.();
    setFailed(message);
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
    console.log(`Code Beat reaction added: ${content} id=${response.data.id}`);
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
    console.log(`Code Beat reaction removed: ${content} id=${reactionId}`);
  } catch (error) {
    console.warn(`::warning::Could not remove ${content} reaction from pull request: ${formatError(error)}`);
  }
}

async function removeIssueReactionsByContent(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number,
  content: "eyes" | "+1"
): Promise<void> {
  try {
    const reactions = await octokit.paginate(octokit.rest.reactions.listForIssue, {
      owner,
      repo,
      issue_number: issueNumber,
      content,
      per_page: 100
    });

    const actionBotLogins = new Set(["github-actions[bot]", "github-actions"]);
    const actionReactions = reactions.filter((reaction) => actionBotLogins.has(reaction.user?.login ?? ""));
    console.log(
      `Code Beat reaction cleanup: found ${reactions.length} ${content} reaction(s), ` +
        `${actionReactions.length} created by GitHub Actions`
    );

    await Promise.all(
      actionReactions.map((reaction) => removeIssueReaction(octokit, owner, repo, issueNumber, reaction.id, content))
    );
  } catch (error) {
    console.warn(`::warning::Could not list ${content} reactions for cleanup: ${formatError(error)}`);
  }
}

const FAILURE_COMMENT_MARKER = "<!-- code-beat-failure-comment -->";

async function upsertFailureComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number,
  errorMessage: string
): Promise<void> {
  const body = formatFailureComment(errorMessage);

  try {
    const comments = await octokit.paginate(octokit.rest.issues.listComments, {
      owner,
      repo,
      issue_number: issueNumber,
      per_page: 100
    });
    const previous = comments.find(
      (comment) => isActionBotLogin(comment.user?.login ?? "") && comment.body?.includes(FAILURE_COMMENT_MARKER)
    );

    if (previous) {
      await octokit.rest.issues.updateComment({
        owner,
        repo,
        comment_id: previous.id,
        body
      });
      console.log(`Code Beat updated failure comment id=${previous.id}`);
      return;
    }

    const response = await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body
    });
    console.log(`Code Beat posted failure comment id=${response.data.id}`);
  } catch (error) {
    console.warn(`::warning::Could not post Code Beat failure comment: ${formatError(error)}`);
  }
}

async function deleteFailureComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number
): Promise<void> {
  try {
    const comments = await octokit.paginate(octokit.rest.issues.listComments, {
      owner,
      repo,
      issue_number: issueNumber,
      per_page: 100
    });
    const previous = comments.find(
      (comment) => isActionBotLogin(comment.user?.login ?? "") && comment.body?.includes(FAILURE_COMMENT_MARKER)
    );

    if (!previous) {
      return;
    }

    await octokit.rest.issues.deleteComment({
      owner,
      repo,
      comment_id: previous.id
    });
    console.log(`Code Beat deleted stale failure comment id=${previous.id}`);
  } catch (error) {
    console.warn(`::warning::Could not delete stale Code Beat failure comment: ${formatError(error)}`);
  }
}

function formatFailureComment(errorMessage: string): string {
  const runUrl = buildRunUrl();
  const lines = [
    FAILURE_COMMENT_MARKER,
    "## 🥁 Code Beat could not finish",
    "",
    "I could not produce a trustworthy review for this run, so I did not post a score or inline comments.",
    "",
    `**Reason:** ${sanitizeErrorMessage(errorMessage)}`,
    "",
    "The workflow is marked failed so this does not get mistaken for a clean 5/5 review."
  ];

  if (runUrl) {
    lines.push("", `🔎 **Logs:** ${runUrl}`);
  }

  lines.push("", "_Tiny drumsticks, honest failure mode._");
  return lines.join("\n");
}

function buildRunUrl(): string | undefined {
  const serverUrl = process.env.GITHUB_SERVER_URL;
  const repository = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  if (!serverUrl || !repository || !runId) {
    return undefined;
  }

  return `${serverUrl}/${repository}/actions/runs/${runId}`;
}

function sanitizeErrorMessage(message: string): string {
  return truncateForComment(
    message
      .replace(/sk-or-v1-[a-z0-9]+/gi, "[redacted-openrouter-key]")
      .replace(/gh[pousr]_[A-Za-z0-9_]+/g, "[redacted-github-token]")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function truncateForComment(value: string): string {
  if (value.length <= 1500) {
    return value || "Unknown error.";
  }

  return `${value.slice(0, 1499).trimEnd()}…`;
}

function isActionBotLogin(login: string): boolean {
  return login === "github-actions" || login === "github-actions[bot]";
}

interface ReviewThreadsQueryResponse {
  repository?: {
    pullRequest?: {
      reviewThreads: {
        nodes: Array<{
          id: string;
          isResolved: boolean;
          isOutdated: boolean;
          path?: string | null;
          line?: number | null;
          comments: {
            nodes: Array<{
              author?: { login: string } | null;
              body: string;
              createdAt: string;
              path?: string | null;
              line?: number | null;
              url?: string | null;
            } | null>;
            pageInfo: {
              hasNextPage: boolean;
              endCursor?: string | null;
            };
          };
        } | null>;
        pageInfo: {
          hasNextPage: boolean;
          endCursor?: string | null;
        };
      };
    } | null;
  } | null;
}

interface ReviewThreadCommentsQueryResponse {
  node?: {
    comments?: {
      nodes: Array<{
        author?: { login: string } | null;
        body: string;
        createdAt: string;
        path?: string | null;
        line?: number | null;
        url?: string | null;
      } | null>;
      pageInfo: {
        hasNextPage: boolean;
        endCursor?: string | null;
      };
    };
  } | null;
}

async function fetchReviewThreads(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<PullRequestReviewThreadContext[]> {
  const query = `query CodeBeatReviewThreads($owner: String!, $repo: String!, $number: Int!, $after: String) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        reviewThreads(first: 100, after: $after) {
          nodes {
            id
            isResolved
            isOutdated
            path
            line
            comments(first: 100) {
              nodes {
                author {
                  login
                }
                body
                createdAt
                path
                line
                url
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }
  }`;

  try {
    const threads: PullRequestReviewThreadContext[] = [];
    let after: string | undefined;
    let threadPageCount = 0;
    let extraCommentPageCount = 0;

    do {
      threadPageCount += 1;
      const response = await octokit.graphql<ReviewThreadsQueryResponse>(query, {
        owner,
        repo,
        number: prNumber,
        after
      });
      const reviewThreads = response.repository?.pullRequest?.reviewThreads;
      if (!reviewThreads) {
        return threads;
      }
      console.log(
        `Code Beat review thread fetch page ${threadPageCount}: ${reviewThreads.nodes.filter(Boolean).length} thread(s)`
      );

      for (const thread of reviewThreads.nodes) {
        if (!thread) {
          continue;
        }

        const comments: PullRequestReviewThreadContext["comments"] = thread.comments.nodes
          .filter((comment) => comment !== null)
          .map(mapReviewThreadComment);
        if (thread.comments.pageInfo.hasNextPage) {
          const extraComments = await fetchRemainingReviewThreadComments(
            octokit,
            thread.id,
            thread.comments.pageInfo.endCursor ?? undefined
          );
          extraCommentPageCount += extraComments.pageCount;
          comments.push(...extraComments.comments);
        }

        threads.push({
          isResolved: thread.isResolved,
          isOutdated: thread.isOutdated,
          path: thread.path ?? undefined,
          line: thread.line ?? undefined,
          comments
        });
      }

      after = reviewThreads.pageInfo.endCursor ?? undefined;
      if (!reviewThreads.pageInfo.hasNextPage) {
        break;
      }
    } while (after);

    const totalThreadComments = threads.reduce((sum, thread) => sum + thread.comments.length, 0);
    console.log(
      `Code Beat review thread fetch complete: ${threads.length} thread(s), ${totalThreadComments} thread comment(s), ` +
        `${threadPageCount} thread page(s), ${extraCommentPageCount} extra comment page(s)`
    );
    return threads;
  } catch (error) {
    console.warn(`::warning::Could not fetch pull request review threads: ${formatError(error)}`);
    return [];
  }
}

async function fetchRemainingReviewThreadComments(
  octokit: Octokit,
  threadId: string,
  firstCursor: string | undefined
): Promise<{
  comments: PullRequestReviewThreadContext["comments"];
  pageCount: number;
}> {
  const query = `query CodeBeatReviewThreadComments($threadId: ID!, $after: String) {
    node(id: $threadId) {
      ... on PullRequestReviewThread {
        comments(first: 100, after: $after) {
          nodes {
            author {
              login
            }
            body
            createdAt
            path
            line
            url
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }
  }`;

  const comments: PullRequestReviewThreadContext["comments"] = [];
  let after = firstCursor;
  let pageCount = 0;

  while (after) {
    pageCount += 1;
    const response = await octokit.graphql<ReviewThreadCommentsQueryResponse>(query, {
      threadId,
      after
    });
    const page = response.node?.comments;
    if (!page) {
      break;
    }

    comments.push(...page.nodes.filter((comment) => comment !== null).map(mapReviewThreadComment));
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor ?? undefined : undefined;
  }

  return { comments, pageCount };
}

function mapReviewThreadComment(comment: {
  author?: { login: string } | null;
  body: string;
  createdAt: string;
  path?: string | null;
  line?: number | null;
  url?: string | null;
}): PullRequestReviewThreadContext["comments"][number] {
  return {
    author: comment.author?.login ?? "unknown",
    body: comment.body,
    path: comment.path ?? undefined,
    line: comment.line ?? undefined,
    createdAt: comment.createdAt,
    url: comment.url ?? undefined
  };
}

function describeChangedFiles(files: PullRequestFile[]): string {
  const additions = files.reduce((sum, file) => sum + file.additions, 0);
  const deletions = files.reduce((sum, file) => sum + file.deletions, 0);
  const patchUnavailable = files.filter((file) => !file.patch).length;
  const statuses = countBy(files, (file) => file.status);
  return `${additions} addition(s), ${deletions} deletion(s), ${patchUnavailable} file(s) without patch, statuses=${formatCounts(statuses)}`;
}

function describeConversation(
  issueComments: Array<{ user?: { login?: string } | null }>,
  reviewComments: Array<{ user?: { login?: string } | null }>,
  reviewThreads: PullRequestReviewThreadContext[]
): string {
  const resolvedThreads = reviewThreads.filter((thread) => thread.isResolved).length;
  const outdatedThreads = reviewThreads.filter((thread) => thread.isOutdated).length;
  const threadComments = reviewThreads.reduce((sum, thread) => sum + thread.comments.length, 0);
  const issueAuthors = countBy(issueComments, (comment) => comment.user?.login ?? "unknown");
  const reviewAuthors = countBy(reviewComments, (comment) => comment.user?.login ?? "unknown");
  return (
    `${resolvedThreads}/${reviewThreads.length} resolved thread(s), ${outdatedThreads} outdated thread(s), ` +
    `${threadComments} thread comment(s), issue authors=${formatCounts(issueAuthors)}, review authors=${formatCounts(reviewAuthors)}`
  );
}

function countBy<T>(items: T[], getKey: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = getKey(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return counts;
}

function formatCounts(counts: Map<string, number>): string {
  if (counts.size === 0) {
    return "none";
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([key, count]) => `${key}:${count}`)
    .join(",");
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

function parseOptionalPositiveNumberInput(name: string, fallback: number): number {
  const value = getInput(name);
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative number.`);
  }

  return parsed;
}

function parseModelListInput(name: string): string[] {
  return parseModelListValue(getInput(name));
}

function formatModelList(models: string[]): string {
  return models.length > 0 ? models.join(",") : "(default)";
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

void run();
