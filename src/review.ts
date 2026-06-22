import { generateText, Output as aiOutput, stepCountIs, ToolLoopAgent } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";
import { THERMO_NUCLEAR_CODE_QUALITY_REVIEW_PROMPT, THERMO_NUCLEAR_REVIEW_PROMPT } from "./prompt.js";
import { buildDiffContext, type PullRequestFile } from "./diff.js";
import { collectRepoInstructions, createReviewTools } from "./repo-tools.js";
import {
  agentReviewSchema,
  reviewSchema,
  type AgentReviewResult,
  type ReviewFinding,
  type ReviewResult
} from "./schema.js";

export interface PullRequestCommentContext {
  issueComments: Array<{ author: string; body: string; createdAt?: string }>;
  reviewComments: Array<{ author: string; body: string; path?: string; line?: number; createdAt?: string }>;
  reviewThreads: PullRequestReviewThreadContext[];
}

export interface PullRequestReviewThreadContext {
  isResolved: boolean;
  isOutdated: boolean;
  path?: string;
  line?: number;
  comments: Array<{ author: string; body: string; path?: string; line?: number; createdAt?: string; url?: string }>;
}

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
  comments: PullRequestCommentContext;
  maxComments: number;
  reviewRuns: number;
  codeQualityRuns: number;
  workspaceRoot: string;
}

export interface ValidatedReview {
  result: ReviewResult;
  comments: ReviewFinding[];
  skippedCommentCount: number;
  truncatedDiff: boolean;
}

type ReviewCategory = "review" | "code-quality";
type ReviewModel = ReturnType<ReturnType<typeof createOpenRouter>["chat"]>;

interface WorkerRunResult {
  category: ReviewCategory;
  output: AgentReviewResult;
  skipped: boolean;
  error?: string;
}

const MAX_AGENT_RUNS = 5;
const MODEL_CALL_TIMEOUT_MS = 180_000;
const MODEL_CALL_TIMEOUT = { totalMs: MODEL_CALL_TIMEOUT_MS };
const looseFindingOutputSchema = z.object({
  path: z.string(),
  line: z.coerce.number(),
  severity: z.enum(["blocker", "major", "minor"]).optional(),
  title: z.string(),
  body: z.string()
});
const looseAgentReviewOutputSchema = z.object({
  summary: z.string(),
  findings: z
    .array(
      looseFindingOutputSchema.extend({
        confidence: z.coerce.number().optional(),
        evidence: z.string().optional(),
        category: z.enum(["review", "code-quality"]).optional()
      })
    )
    .default([])
});
const looseReviewOutputSchema = z.object({
  score: z.coerce.number(),
  summary: z.string(),
  findings: z.array(looseFindingOutputSchema).default([])
});

export async function reviewPullRequest(input: ReviewInput): Promise<ValidatedReview> {
  const openrouter = createOpenRouter({
    apiKey: input.apiKey
  });
  const model = openrouter.chat(input.model);
  const diffContext = buildDiffContext(input.files);
  const repoInstructions = collectRepoInstructions(input.workspaceRoot);
  const basePrompt = buildReviewPrompt(input, diffContext.prompt, diffContext.truncated, repoInstructions);
  console.log(
    `Code Beat context: ${input.files.length} file(s), ${input.comments.issueComments.length} issue comment(s), ` +
      `${input.comments.reviewComments.length} review comment(s), ${input.comments.reviewThreads.length} review thread(s), ` +
      `diff prompt chars=${diffContext.prompt.length}, diff truncated=${diffContext.truncated}`
  );
  const tools = createReviewTools({
    root: input.workspaceRoot,
    prDetails: buildPrDetails(input, diffContext.truncated),
    prComments: {
      issueComments: input.comments.issueComments,
      reviewComments: input.comments.reviewComments,
      reviewThreads: input.comments.reviewThreads,
      reviewThreadCount: input.comments.reviewThreads.length,
      note:
        "Full PR conversation context is included here. Use getReviewThreads when you want filtered or paginated review-thread lookup."
    },
    prReviewThreads: input.comments.reviewThreads,
    repoInstructions
  });

  const reviewRunCount = clampRunCount(input.reviewRuns);
  const codeQualityRunCount = clampRunCount(input.codeQualityRuns);
  const workerRuns = [
    ...Array.from({ length: reviewRunCount }, (_, index) =>
      runWorkerAgent({
        category: "review",
        passNumber: index + 1,
        model,
        tools,
        basePrompt
      })
    ),
    ...Array.from({ length: codeQualityRunCount }, (_, index) =>
      runWorkerAgent({
        category: "code-quality",
        passNumber: index + 1,
        model,
        tools,
        basePrompt
      })
    )
  ];

  const workerResults = await Promise.all(workerRuns);
  const skippedWorkerErrors = workerResults.flatMap((result) => (result.error ? [result.error] : []));
  console.log(
    `Code Beat workers complete: ${workerResults.filter((result) => !result.skipped).length}/${workerResults.length} valid output(s), ` +
      `${skippedWorkerErrors.length} skipped`
  );
  if (workerRuns.length > 0 && skippedWorkerErrors.length === workerResults.length) {
    console.error("Code Beat all workers failed. Worker errors:");
    for (const [index, error] of skippedWorkerErrors.entries()) {
      console.error(`Code Beat worker error ${index + 1}: ${error}`);
    }
    throw new Error(
      `Code Beat could not produce a review because every AI worker failed. First error: ${skippedWorkerErrors[0]}`
    );
  }
  const reviewResults = workerResults.filter((result) => result.category === "review" && !result.skipped);
  const codeQualityResults = workerResults.filter((result) => result.category === "code-quality" && !result.skipped);

  const [reviewConsolidation, codeQualityConsolidation] = await Promise.all([
    consolidateCategory("review", reviewResults.map((result) => result.output), input, model),
    consolidateCategory("code-quality", codeQualityResults.map((result) => result.output), input, model)
  ]);

  const finalResult = await consolidateFinalReview({
    reviewConsolidation,
    codeQualityConsolidation,
    input,
    model
  });
  const resultWithThreadFeedback = applyReviewThreadFeedback(finalResult, input.comments.reviewThreads);
  const suppressedFindingCount = finalResult.findings.length - resultWithThreadFeedback.findings.length;
  if (suppressedFindingCount > 0) {
    console.log(`Code Beat thread feedback suppressed ${suppressedFindingCount} repeated finding(s)`);
  }

  const { comments, skippedCommentCount } = selectInlineComments(
    resultWithThreadFeedback.findings,
    diffContext.commentableLines,
    input.maxComments
  );
  console.log(
    `Code Beat selected ${comments.length} inline comment(s), skipped ${skippedCommentCount} finding(s), score=${resultWithThreadFeedback.score}`
  );

  return {
    result: {
      ...resultWithThreadFeedback,
      score: clampScore(resultWithThreadFeedback.score)
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

async function runWorkerAgent(args: {
  category: ReviewCategory;
  passNumber: number;
  model: ReviewModel;
  tools: ReturnType<typeof createReviewTools>;
  basePrompt: string;
}): Promise<WorkerRunResult> {
  const startedAt = Date.now();
  console.log(`Code Beat worker start: ${args.category} pass ${args.passNumber}`);
  try {
    const agent = new ToolLoopAgent({
      model: args.model,
      tools: args.tools,
      instructions: buildWorkerInstructions(args.category, args.passNumber),
      output: aiOutput.object({
        schema: looseAgentReviewOutputSchema,
        name: "agent_review",
        description: "A concise pull request review result with high-confidence findings."
      }),
      temperature: 0.2,
      stopWhen: stepCountIs(8)
    });

    const result = await agent.generate({
      timeout: MODEL_CALL_TIMEOUT,
      prompt: `${args.basePrompt}

You are ${args.category} pass ${args.passNumber}. Work independently. Use tools to inspect repository context when the diff alone is not enough. Return only high-confidence findings grounded in evidence.`
    });

    console.log(
      `Code Beat worker complete: ${args.category} pass ${args.passNumber} in ${Date.now() - startedAt}ms, ` +
        `response chars=${result.text.length}`
    );
    const output = normalizeAgentReviewResult(result.output, args.category);
    console.log(
      `Code Beat worker parsed: ${args.category} pass ${args.passNumber} produced ${output.findings.length} finding(s)`
    );
    return {
      category: args.category,
      output,
      skipped: false
    };
  } catch (error) {
    const message = formatError(error);
    console.warn(
      `::warning::Code Beat worker skipped: ${args.category} pass ${args.passNumber} failed after ${
        Date.now() - startedAt
      }ms: ${message}`
    );
    return {
      category: args.category,
      output: {
        summary: `${args.category} pass ${args.passNumber} was skipped after an error: ${message}`,
        findings: []
      },
      skipped: true,
      error: message
    };
  }
}

async function consolidateCategory(
  category: ReviewCategory,
  results: AgentReviewResult[],
  input: ReviewInput,
  model: ReviewModel
): Promise<AgentReviewResult> {
  const startedAt = Date.now();
  console.log(`Code Beat consolidation start: ${category} with ${results.length} result(s)`);
  if (results.length === 0) {
    console.log(`Code Beat consolidation skipped: ${category} had no valid outputs`);
    return {
      summary: `No valid ${category} reviewer outputs were available.`,
      findings: []
    };
  }

  if (results.length === 1) {
    console.log(`Code Beat consolidation skipped: ${category} had a single valid output`);
    return mergeAgentResults(category, results, `Using the single valid ${category} reviewer output.`);
  }

  try {
    const { output } = await generateText({
      model,
      timeout: MODEL_CALL_TIMEOUT,
      output: aiOutput.object({
        schema: looseAgentReviewOutputSchema,
        name: "category_consolidation",
        description: "A deduplicated category review result."
      }),
      system: `You consolidate ${category} reviewer outputs for Code Beat.

Drop duplicate, weak, speculative, unactionable, or poorly grounded findings.
Preserve only findings that are useful as pull request review feedback.
Keep exact file paths and added-line numbers when present.
Return a concise summary and a ranked findings list.
Return JSON only, with shape:
{"summary": string, "findings": [{"path": string, "line": number, "severity": "blocker"|"major"|"minor", "title": string, "body": string, "confidence": number, "evidence": string, "category": "review"|"code-quality"}]}`,
      prompt: `Pull request: ${input.owner}/${input.repo}#${input.prNumber}
Title: ${input.title}

Reviewer outputs:
${JSON.stringify(results, null, 2)}`,
      temperature: 0
    });

    const parsedOutput = normalizeAgentReviewResult(output, category);
    console.log(
      `Code Beat consolidation complete: ${category} in ${Date.now() - startedAt}ms with ${parsedOutput.findings.length} finding(s)`
    );
    return parsedOutput;
  } catch (error) {
    throw new Error(
      `Code Beat ${category} consolidation failed after ${Date.now() - startedAt}ms: ${formatError(error)}`
    );
  }
}

async function consolidateFinalReview(args: {
  reviewConsolidation: AgentReviewResult;
  codeQualityConsolidation: AgentReviewResult;
  input: ReviewInput;
  model: ReviewModel;
}): Promise<ReviewResult> {
  const candidateFindings = [...args.reviewConsolidation.findings, ...args.codeQualityConsolidation.findings];
  const startedAt = Date.now();
  console.log(`Code Beat final consolidation start with ${candidateFindings.length} candidate finding(s)`);

  try {
    const { output } = await generateText({
      model: args.model,
      timeout: MODEL_CALL_TIMEOUT,
      output: aiOutput.object({
        schema: looseReviewOutputSchema,
        name: "final_review",
        description: "The final Code Beat pull request review with score and selected findings."
      }),
      system: `You are the final Code Beat review orchestrator.

Merge normal review findings and thermo-nuclear code-quality findings into one pull request review.
Remove overlap across categories.
Prefer high-confidence, actionable, non-nit findings.
Keep inline comments focused and direct.
Score from 0 to 5:
- 0: severe correctness or structural failure
- 1: major issues that should block merge
- 2: significant concerns
- 3: acceptable with notable improvements
- 4: good with minor concerns
- 5: no clear concerns
Return JSON only, with shape:
{"score": number, "summary": string, "findings": [{"path": string, "line": number, "severity": "blocker"|"major"|"minor", "title": string, "body": string}]}`,
      prompt: `Pull request: ${args.input.owner}/${args.input.repo}#${args.input.prNumber}
Title: ${args.input.title}

Review consolidation:
${JSON.stringify(args.reviewConsolidation, null, 2)}

Code-quality consolidation:
${JSON.stringify(args.codeQualityConsolidation, null, 2)}`,
      temperature: 0
    });

    const parsedOutput = normalizeReviewResult(output);
    console.log(
      `Code Beat final consolidation complete in ${Date.now() - startedAt}ms with score ${parsedOutput.score} and ${parsedOutput.findings.length} finding(s)`
    );
    return parsedOutput;
  } catch (error) {
    throw new Error(`Code Beat final consolidation failed after ${Date.now() - startedAt}ms: ${formatError(error)}`);
  }
}

function buildWorkerInstructions(category: ReviewCategory, passNumber: number): string {
  if (category === "code-quality") {
    return `${THERMO_NUCLEAR_CODE_QUALITY_REVIEW_PROMPT}

You are one of several independent Code Beat code-quality reviewer agents.
This is pass ${passNumber}. Do not assume another pass will catch important issues.
Use the available tools to inspect local repository context, PR metadata, PR comments, repository instructions, changed files, nearby code, and existing helpers when useful.
Return only findings that are strongly grounded and actionable.`;
  }

  return `${THERMO_NUCLEAR_REVIEW_PROMPT}

You are one of several independent Code Beat pull request reviewer agents.
This is pass ${passNumber}. Do not assume another pass will catch important issues.

Use the available tools to inspect local repository context, PR metadata, PR comments, repository instructions, changed files, nearby code, and existing helpers when useful.
Return only findings that are strongly grounded and actionable.`;
}

function buildReviewPrompt(
  input: ReviewInput,
  diff: string,
  truncated: boolean,
  repoInstructions: string
): string {
  return `Review this pull request.

Repository: ${input.owner}/${input.repo}
Pull request: #${input.prNumber}
Title: ${input.title}
Author: ${input.author}
Base branch: ${input.baseRef}
Head branch: ${input.headRef}
Diff truncated: ${truncated ? "yes" : "no"}

Pull request body:
${input.body || "(empty)"}

Existing PR comments and review comments are available through tools.
Prior review threads, including resolved threads and human replies, are available through tools.

Repository instructions discovered up front:
${repoInstructions || "(none found)"}

Inline comment rules:
- Only create findings on added lines visible in the diff.
- Use the exact file path and new-line number from the diff.
- Keep comments specific, actionable, and focused on issues worth raising.
- Prefer fewer high-conviction findings over many weak comments.
- Do not repeat prior Code Beat findings from resolved threads or threads where a human explained the issue was invalid, intentional, expected, or already handled.
- If you re-raise a previously disputed finding, explain what new evidence makes it still actionable.
- Return JSON only, with shape:
{"summary": string, "findings": [{"path": string, "line": number, "severity": "blocker"|"major"|"minor", "title": string, "body": string, "confidence": number, "evidence": string, "category": "review"|"code-quality"}]}

Changed files:
${diff}`;
}

function normalizeAgentReviewResult(value: unknown, defaultCategory: ReviewCategory): AgentReviewResult {
  const input = asRecord(value);
  const findings = Array.isArray(input.findings) ? input.findings : [];

  return agentReviewSchema.parse({
    summary: truncate(String(input.summary ?? "No summary provided."), 3000),
    findings: findings
      .map((finding) => normalizeAgentFinding(finding, defaultCategory))
      .filter((finding) => finding !== undefined)
  });
}

function normalizeReviewResult(value: unknown): ReviewResult {
  const input = asRecord(value);
  const findings = Array.isArray(input.findings) ? input.findings : [];

  return reviewSchema.parse({
    score: clampScore(Number(input.score ?? 0)),
    summary: truncate(String(input.summary ?? "No summary provided."), 4000),
    findings: findings.map((finding) => normalizeFinding(finding)).filter((finding) => finding !== undefined)
  });
}

function normalizeAgentFinding(value: unknown, defaultCategory: ReviewCategory) {
  const finding = normalizeFinding(value);
  if (!finding) {
    return undefined;
  }

  const input = asRecord(value);
  const rawConfidence = Number(input.confidence ?? 0.7);
  const confidence = rawConfidence > 1 && rawConfidence <= 100 ? rawConfidence / 100 : rawConfidence;
  const category = input.category === "review" || input.category === "code-quality" ? input.category : defaultCategory;

  return {
    ...finding,
    confidence: Math.min(1, Math.max(0, Number.isFinite(confidence) ? confidence : 0.7)),
    evidence: truncate(String(input.evidence ?? finding.body), 1500),
    category
  };
}

export function applyReviewThreadFeedback(result: ReviewResult, threads: PullRequestReviewThreadContext[]): ReviewResult {
  const suppressed = buildSuppressedFindingMatcher(threads);
  if (!suppressed) {
    return result;
  }

  const findings = result.findings.filter((finding) => !suppressed(finding));
  if (findings.length === result.findings.length) {
    return result;
  }

  if (findings.length === 0) {
    return {
      score: 5,
      summary: "No new actionable findings after accounting for resolved or disputed prior Code Beat review threads.",
      findings
    };
  }

  return {
    ...result,
    findings
  };
}

function buildSuppressedFindingMatcher(
  threads: PullRequestReviewThreadContext[]
): ((finding: ReviewFinding) => boolean) | undefined {
  const keys = new Set<string>();

  for (const thread of threads) {
    const firstCodeBeatComment = thread.comments.find((comment) => isCodeBeatInlineComment(comment.body));
    if (!firstCodeBeatComment) {
      continue;
    }

    const hasHumanDisagreement = thread.comments
      .filter((comment) => comment !== firstCodeBeatComment)
      .some((comment) => isHumanReviewReply(comment.author) && isSuppressiveReply(comment.body));

    if (!thread.isResolved && !hasHumanDisagreement) {
      continue;
    }

    const path = firstCodeBeatComment.path ?? thread.path;
    const line = firstCodeBeatComment.line ?? thread.line;
    const title = parseCodeBeatInlineCommentTitle(firstCodeBeatComment.body);

    if (path && line !== undefined) {
      keys.add(findingLocationKey(path, line));
    }

    if (path && title) {
      keys.add(findingTitleKey(path, title));
    }
  }

  if (keys.size === 0) {
    return undefined;
  }

  return (finding) => keys.has(findingLocationKey(finding.path, finding.line)) || keys.has(findingTitleKey(finding.path, finding.title));
}

function isCodeBeatInlineComment(body: string): boolean {
  return parseCodeBeatInlineCommentTitle(body) !== undefined;
}

function parseCodeBeatInlineCommentTitle(body: string): string | undefined {
  const match = /^\*\*(?:\S+\s+)?(?:blocker|major|minor):\s+(.+?)\*\*/i.exec(body.trim());
  return match?.[1]?.trim();
}

function isHumanReviewReply(author: string): boolean {
  return author !== "github-actions" && !author.endsWith("[bot]");
}

function isSuppressiveReply(body: string): boolean {
  const normalized = body.toLowerCase();
  return [
    "not valid",
    "invalid",
    "false positive",
    "not an issue",
    "intentional",
    "expected",
    "by design",
    "already handled",
    "won't fix",
    "wont fix"
  ].some((phrase) => normalized.includes(phrase));
}

function findingLocationKey(path: string, line: number): string {
  return `location:${path}:${line}`;
}

function findingTitleKey(path: string, title: string): string {
  return `title:${path}:${normalizeTitle(title)}`;
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function mergeAgentResults(
  category: ReviewCategory,
  results: AgentReviewResult[],
  summaryPrefix: string
): AgentReviewResult {
  const findings = [];
  const seen = new Set<string>();

  for (const result of results) {
    for (const finding of result.findings) {
      const normalized = normalizeAgentFinding(finding, category);
      if (!normalized) {
        continue;
      }

      const key = `${normalized.path}:${normalized.line}:${normalized.title.toLowerCase()}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      findings.push(normalized);
    }
  }

  findings.sort((left, right) => {
    const severityDelta = severityRank(right.severity) - severityRank(left.severity);
    if (severityDelta !== 0) {
      return severityDelta;
    }

    return right.confidence - left.confidence;
  });

  return agentReviewSchema.parse({
    summary: truncate(`${summaryPrefix} Using ${findings.length} normalized finding(s) from valid ${category} outputs.`, 3000),
    findings
  });
}

function severityRank(severity: ReviewFinding["severity"]): number {
  if (severity === "blocker") {
    return 3;
  }
  if (severity === "major") {
    return 2;
  }
  return 1;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function normalizeFinding(value: unknown): ReviewFinding | undefined {
  const input = asRecord(value);
  const path = String(input.path ?? "").trim();
  const line = Math.floor(Number(input.line));
  if (!path || !Number.isFinite(line) || line < 1) {
    return undefined;
  }

  return {
    path,
    line,
    severity: normalizeSeverity(input.severity),
    title: truncate(String(input.title ?? "Review finding"), 120),
    body: truncate(String(input.body ?? ""), 2000)
  };
}

function normalizeSeverity(value: unknown): ReviewFinding["severity"] {
  if (value === "blocker" || value === "major" || value === "minor") {
    return value;
  }

  return "major";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function truncate(value: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed || "No details provided.";
  }

  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`;
}

function buildPrDetails(input: ReviewInput, truncatedDiff: boolean) {
  return {
    repository: `${input.owner}/${input.repo}`,
    prNumber: input.prNumber,
    title: input.title,
    body: input.body,
    author: input.author,
    baseRef: input.baseRef,
    headRef: input.headRef,
    truncatedDiff,
    files: input.files
  };
}

function clampRunCount(value: number): number {
  if (!Number.isFinite(value)) {
    return 2;
  }

  return Math.min(MAX_AGENT_RUNS, Math.max(0, Math.floor(value)));
}

function clampScore(score: number): number {
  if (Number.isNaN(score)) {
    return 0;
  }

  return Math.min(5, Math.max(0, Number(score.toFixed(2))));
}
