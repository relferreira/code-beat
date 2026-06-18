import { generateObject } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { SYSTEM_PROMPT } from "./prompt.js";
import { buildDiffContext, type PullRequestFile } from "./diff.js";
import { reviewSchema, type ReviewFinding, type ReviewResult } from "./schema.js";

export interface ReviewInput {
  apiKey: string;
  model: string;
  owner: string;
  repo: string;
  prNumber: number;
  title: string;
  body: string;
  author: string;
  baseRef: string;
  headRef: string;
  files: PullRequestFile[];
  maxComments: number;
}

export interface ValidatedReview {
  result: ReviewResult;
  comments: ReviewFinding[];
  skippedCommentCount: number;
  truncatedDiff: boolean;
}

export async function reviewPullRequest(input: ReviewInput): Promise<ValidatedReview> {
  const openrouter = createOpenRouter({
    apiKey: input.apiKey
  });
  const diffContext = buildDiffContext(input.files);
  const prompt = buildReviewPrompt(input, diffContext.prompt, diffContext.truncated);

  const { object } = await generateObject({
    model: openrouter.chat(input.model),
    schema: reviewSchema,
    system: SYSTEM_PROMPT,
    prompt,
    temperature: 0.1
  });

  const { comments, skippedCommentCount } = selectInlineComments(
    object.findings,
    diffContext.commentableLines,
    input.maxComments
  );

  return {
    result: {
      ...object,
      score: clampScore(object.score)
    },
    comments,
    skippedCommentCount,
    truncatedDiff: diffContext.truncated
  };
}

export function selectInlineComments(
  findings: ReviewFinding[],
  commentableLines: Map<string, Set<number>>,
  maxComments: number
): { comments: ReviewFinding[]; skippedCommentCount: number } {
  const comments: ReviewFinding[] = [];
  let skippedCommentCount = 0;
  const seen = new Set<string>();

  for (const finding of findings) {
    const allowedLines = commentableLines.get(finding.path);
    const key = `${finding.path}:${finding.line}:${finding.title}`;

    if (!allowedLines?.has(finding.line) || seen.has(key)) {
      skippedCommentCount += 1;
      continue;
    }

    if (comments.length >= Math.max(0, maxComments)) {
      skippedCommentCount += 1;
      continue;
    }

    seen.add(key);
    comments.push(finding);
  }

  return { comments, skippedCommentCount };
}

function buildReviewPrompt(input: ReviewInput, diff: string, truncated: boolean): string {
  return `Review this pull request. Return only structured data matching the requested schema.

Repository: ${input.owner}/${input.repo}
Pull request: #${input.prNumber}
Title: ${input.title}
Author: ${input.author}
Base branch: ${input.baseRef}
Head branch: ${input.headRef}
Diff truncated: ${truncated ? "yes" : "no"}

Pull request body:
${input.body || "(empty)"}

Inline comment rules:
- Only create findings on added lines visible in the diff.
- Use the exact file path and new-line number from the diff.
- Keep comments specific, actionable, and focused on maintainability/design issues.
- Prefer fewer high-conviction findings over many weak comments.
- Score 0 means severe structural regression; 5 means no clear maintainability concerns.

Changed files:
${diff}`;
}

function clampScore(score: number): number {
  if (Number.isNaN(score)) {
    return 0;
  }

  return Math.min(5, Math.max(0, Number(score.toFixed(2))));
}
