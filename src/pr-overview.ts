import { generateText, Output as aiOutput, type LanguageModel } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createRetryableModel, error, httpStatus } from "ai-retry/language-model";
import { z } from "zod";
import { buildDiffContext, type PullRequestFile } from "./diff.js";
import { prOverviewSchema, type PrOverview } from "./report-schema.js";
import type { RetryPolicy } from "./review.js";

const OVERVIEW_TIMEOUT_MS = 90_000;
const MAX_OVERVIEW_DIFF_CHARS = 80_000;

const looseOverviewSchema = z.object({
  headline: z.string(),
  body: z.string(),
  majorDecisions: z.array(z.string()).default([]),
  areas: z.array(z.string()).default([])
});

export interface GeneratePrOverviewInput {
  apiKey: string;
  model: string;
  retryPolicy: RetryPolicy;
  owner: string;
  repo: string;
  prNumber: number;
  title: string;
  body: string;
  author: string;
  baseRef: string;
  headRef: string;
  files: PullRequestFile[];
}

/**
 * Produce a bird's-eye PR report: what the change does, how it fits together,
 * and the major decisions — not a list of review findings.
 *
 * Best-effort: on model failure returns a deterministic fallback so report
 * publishing still succeeds.
 */
export async function generatePrOverview(input: GeneratePrOverviewInput): Promise<PrOverview> {
  const startedAt = Date.now();
  console.log(`Code Beat PR overview start: model=${input.model}`);

  try {
    const openrouter = createOpenRouter({ apiKey: input.apiKey });
    const model = createOverviewModel(openrouter, input.model, input.retryPolicy);
    const diffContext = buildDiffContext(input.files, MAX_OVERVIEW_DIFF_CHARS);

    const result = await generateText({
      model,
      temperature: 0.2,
      maxRetries: 0,
      timeout: { totalMs: OVERVIEW_TIMEOUT_MS },
      output: aiOutput.object({
        schema: looseOverviewSchema,
        name: "pr_overview",
        description: "Bird's-eye pull request overview: purpose, approach, and major decisions."
      }),
      system: OVERVIEW_SYSTEM_PROMPT,
      prompt: buildOverviewPrompt(input, diffContext.prompt, diffContext.truncated)
    });

    const overview = normalizeOverview(result.output);
    console.log(
      `Code Beat PR overview complete in ${Date.now() - startedAt}ms: ` +
        `headline chars=${overview.headline.length}, body chars=${overview.body.length}, ` +
        `decisions=${overview.majorDecisions.length}, areas=${overview.areas.length}`
    );
    return overview;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `::warning::Code Beat PR overview model failed after ${Date.now() - startedAt}ms: ${message}. Using fallback overview.`
    );
    return buildFallbackOverview(input);
  }
}

export function buildFallbackOverview(input: {
  title: string;
  body: string;
  files: PullRequestFile[];
}): PrOverview {
  const headline = truncate(input.title.trim() || "Pull request changes", 240);
  const fileList = input.files
    .slice(0, 20)
    .map((file) => `- \`${file.filename}\` (${file.status}, +${file.additions}/-${file.deletions})`)
    .join("\n");
  const more =
    input.files.length > 20 ? `\n- …and ${input.files.length - 20} more file(s)` : "";
  const bodyParts = [
    input.body.trim()
      ? `## Author description\n\n${truncate(input.body.trim(), 2000)}`
      : "## Author description\n\n_(No PR description was provided.)_",
    `## Files touched\n\n${fileList || "_(No files listed.)_"}${more}`
  ];

  const areas = uniqueAreas(
    input.files.map((file) => areaFromPath(file.filename)).filter((area): area is string => Boolean(area))
  );

  return prOverviewSchema.parse({
    headline,
    body: truncate(bodyParts.join("\n\n"), 8000),
    majorDecisions: [],
    areas
  });
}

const OVERVIEW_SYSTEM_PROMPT = `You write pull request overviews for engineering readers.

Your job is a bird's-eye report on the PR itself — not a code review and not a list of bugs.

Focus on:
1. **What this PR does** — the purpose and user/system-facing outcome.
2. **Big picture** — how the pieces fit together; architecture or data-flow when relevant.
3. **Major decisions** — intentional design/implementation choices visible in the change (APIs, abstractions, trade-offs, migrations, feature flags, etc.).
4. **Scope** — what areas are in and out of this change.

Rules:
- Write for a teammate who has not opened the diff yet.
- Be concrete and grounded in the title, description, and diff. Do not invent features that are not evidenced.
- Prefer clarity over marketing tone. No fluff, no "this PR aims to…".
- Do not list line-level nits, style comments, or review findings.
- Do not restate the entire diff file-by-file; synthesize.
- Use markdown in \`body\` (short sections with headings are good).
- \`headline\` is a single sentence (no markdown), max ~200 chars.
- \`majorDecisions\` are short bullets (one decision each); empty array if none are clear.
- \`areas\` are short labels for components/domains touched (e.g. "checkout", "auth middleware").`;

function buildOverviewPrompt(
  input: GeneratePrOverviewInput,
  diff: string,
  truncated: boolean
): string {
  return `Write a bird's-eye overview of this pull request.

Repository: ${input.owner}/${input.repo}
Pull request: #${input.prNumber}
Title: ${input.title}
Author: ${input.author}
Base branch: ${input.baseRef}
Head branch: ${input.headRef}
Diff truncated: ${truncated ? "yes" : "no"}
Files changed: ${input.files.length}

Pull request body:
${input.body || "(empty)"}

Changed files and diffs:
${diff || "(no diff content available)"}`;
}

function normalizeOverview(value: unknown): PrOverview {
  const input = value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const majorDecisions = Array.isArray(input.majorDecisions)
    ? input.majorDecisions.map((item) => truncate(String(item), 500)).filter(Boolean)
    : [];
  const areas = Array.isArray(input.areas)
    ? uniqueAreas(input.areas.map((item) => truncate(String(item), 80)).filter(Boolean))
    : [];

  return prOverviewSchema.parse({
    headline: truncate(String(input.headline ?? "Pull request changes"), 240),
    body: truncate(String(input.body ?? "No overview available."), 8000),
    majorDecisions: majorDecisions.slice(0, 12),
    areas: areas.slice(0, 20)
  });
}

function createOverviewModel(
  openrouter: ReturnType<typeof createOpenRouter>,
  modelName: string,
  retryPolicy: RetryPolicy
): LanguageModel {
  const baseModel = openrouter.chat(modelName);
  if (retryPolicy.maxAttempts < 2) {
    return baseModel;
  }

  const retryOptions = {
    maxAttempts: retryPolicy.maxAttempts,
    delay: retryPolicy.delayMs,
    backoffFactor: retryPolicy.backoffFactor
  };

  return createRetryableModel({
    model: baseModel,
    retries: [
      httpStatus(429, 500, 502, 503, 504, 529).retry(retryOptions),
      error.isRetryable(true).retry(retryOptions)
    ]
  });
}

function areaFromPath(path: string): string | undefined {
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) {
    return undefined;
  }

  if (parts.length === 1) {
    return parts[0]?.replace(/\.[^.]+$/, "") || undefined;
  }

  // Prefer first meaningful directory (skip generic roots).
  const skip = new Set(["src", "lib", "app", "apps", "packages", "test", "tests", "dist"]);
  for (const part of parts.slice(0, -1)) {
    if (!skip.has(part.toLowerCase())) {
      return part;
    }
  }

  return parts[0];
}

function uniqueAreas(areas: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const area of areas) {
    const key = area.toLowerCase();
    if (seen.has(key) || !area.trim()) {
      continue;
    }
    seen.add(key);
    result.push(area.trim());
  }
  return result;
}

function truncate(value: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed || "No details provided.";
  }

  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`;
}
