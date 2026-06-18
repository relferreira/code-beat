import { generateText, stepCountIs, ToolLoopAgent } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { SYSTEM_PROMPT } from "./prompt.js";
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

const MAX_AGENT_RUNS = 5;

export async function reviewPullRequest(input: ReviewInput): Promise<ValidatedReview> {
  const openrouter = createOpenRouter({
    apiKey: input.apiKey
  });
  const model = openrouter.chat(input.model);
  const diffContext = buildDiffContext(input.files);
  const repoInstructions = collectRepoInstructions(input.workspaceRoot);
  const basePrompt = buildReviewPrompt(input, diffContext.prompt, diffContext.truncated, repoInstructions);
  const tools = createReviewTools({
    root: input.workspaceRoot,
    prDetails: buildPrDetails(input, diffContext.truncated),
    prComments: input.comments,
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
  const reviewResults = workerResults.filter((result) => result.category === "review");
  const codeQualityResults = workerResults.filter((result) => result.category === "code-quality");

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

  const { comments, skippedCommentCount } = selectInlineComments(
    finalResult.findings,
    diffContext.commentableLines,
    input.maxComments
  );

  return {
    result: {
      ...finalResult,
      score: clampScore(finalResult.score)
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
  model: ReturnType<ReturnType<typeof createOpenRouter>["chat"]>;
  tools: ReturnType<typeof createReviewTools>;
  basePrompt: string;
}): Promise<{ category: ReviewCategory; output: AgentReviewResult }> {
  const agent = new ToolLoopAgent({
    model: args.model,
    tools: args.tools,
    instructions: buildWorkerInstructions(args.category, args.passNumber),
    temperature: 0.2,
    stopWhen: stepCountIs(8)
  });

  const result = await agent.generate({
    prompt: `${args.basePrompt}

You are ${args.category} pass ${args.passNumber}. Work independently. Use tools to inspect repository context when the diff alone is not enough. Return only high-confidence findings grounded in evidence.`
  });

  return { category: args.category, output: parseAgentReviewResult(result.text) };
}

async function consolidateCategory(
  category: ReviewCategory,
  results: AgentReviewResult[],
  input: ReviewInput,
  model: ReturnType<ReturnType<typeof createOpenRouter>["chat"]>
): Promise<AgentReviewResult> {
  if (results.length === 0) {
    return {
      summary: `No ${category} reviewers were run.`,
      findings: []
    };
  }

  const { text } = await generateText({
    model,
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

  return parseAgentReviewResult(text);
}

async function consolidateFinalReview(args: {
  reviewConsolidation: AgentReviewResult;
  codeQualityConsolidation: AgentReviewResult;
  input: ReviewInput;
  model: ReturnType<ReturnType<typeof createOpenRouter>["chat"]>;
}): Promise<ReviewResult> {
  const { text } = await generateText({
    model: args.model,
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

  return normalizeReviewResult(parseJsonObject(text));
}

function buildWorkerInstructions(category: ReviewCategory, passNumber: number): string {
  if (category === "code-quality") {
    return `${SYSTEM_PROMPT}

You are one of several independent Code Beat code-quality reviewer agents.
This is pass ${passNumber}. Do not assume another pass will catch important issues.
Use the available tools to inspect local repository context, PR metadata, PR comments, repository instructions, changed files, nearby code, and existing helpers when useful.
Return only findings that are strongly grounded and actionable.`;
  }

  return `You are one of several independent Code Beat pull request reviewer agents.
This is pass ${passNumber}. Do not assume another pass will catch important issues.

Review like a serious senior engineer. Focus on:
- correctness and behavioral regressions
- missing tests for changed behavior
- edge cases and error handling
- security, privacy, or performance risks when visible
- confusing implementation choices that would make maintenance risky

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

Repository instructions discovered up front:
${repoInstructions || "(none found)"}

Inline comment rules:
- Only create findings on added lines visible in the diff.
- Use the exact file path and new-line number from the diff.
- Keep comments specific, actionable, and focused on issues worth raising.
- Prefer fewer high-conviction findings over many weak comments.
- Return JSON only, with shape:
{"summary": string, "findings": [{"path": string, "line": number, "severity": "blocker"|"major"|"minor", "title": string, "body": string, "confidence": number, "evidence": string, "category": "review"|"code-quality"}]}

Changed files:
${diff}`;
}

export function parseJsonObject(text: string): unknown {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/.exec(trimmed);
    if (fenced?.[1]) {
      return JSON.parse(fenced[1]);
    }

    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }

    throw new Error("Model response did not contain a valid JSON object.");
  }
}

function parseAgentReviewResult(text: string): AgentReviewResult {
  return normalizeAgentReviewResult(parseJsonObject(text));
}

function normalizeAgentReviewResult(value: unknown): AgentReviewResult {
  const input = asRecord(value);
  const findings = Array.isArray(input.findings) ? input.findings : [];

  return agentReviewSchema.parse({
    summary: truncate(String(input.summary ?? "No summary provided."), 3000),
    findings: findings.map((finding) => normalizeAgentFinding(finding)).filter((finding) => finding !== undefined)
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

function normalizeAgentFinding(value: unknown) {
  const finding = normalizeFinding(value);
  if (!finding) {
    return undefined;
  }

  const input = asRecord(value);
  const rawConfidence = Number(input.confidence ?? 0.7);
  const confidence = rawConfidence > 1 && rawConfidence <= 100 ? rawConfidence / 100 : rawConfidence;
  const category = input.category === "review" || input.category === "code-quality" ? input.category : "review";

  return {
    ...finding,
    confidence: Math.min(1, Math.max(0, Number.isFinite(confidence) ? confidence : 0.7)),
    evidence: truncate(String(input.evidence ?? finding.body), 1500),
    category
  };
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
