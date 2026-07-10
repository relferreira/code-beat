import { z } from "zod";
import { findingSchema } from "./schema.js";

/**
 * Version of the report.json contract. Bump when the shape changes in a way the
 * viewer must branch on. The viewer reads this before rendering.
 *
 * v2: pull-request overview (bird's-eye narrative + major decisions).
 * v3: diagrams (mermaid), change stats for visual report (no diffs on report tab).
 */
export const REPORT_SCHEMA_VERSION = 3;

export const reportFindingSchema = findingSchema.extend({
  /** Whether this finding was posted as an inline PR comment (vs. skipped). */
  posted: z.boolean()
});

/** Architecture / flow diagram rendered with Mermaid in the viewer. */
export const reportDiagramSchema = z.object({
  title: z.string().min(1).max(120),
  /** Optional short caption under the diagram. */
  caption: z.string().max(400).optional(),
  /** Mermaid source (flowchart, sequenceDiagram, C4-style flowchart, etc.). */
  mermaid: z.string().min(1).max(5000)
});

/**
 * Bird's-eye narrative of the PR itself — what it does, why, and the big-picture
 * decisions — distinct from the code-review findings.
 */
export const prOverviewSchema = z.object({
  /** One-line description of what this PR does. */
  headline: z.string().min(1).max(240),
  /**
   * Markdown bird's-eye view: purpose, approach, scope, and how pieces fit
   * together. Not a line-by-line changelog and not a review of bugs.
   */
  body: z.string().min(1).max(8000),
  /** Explicit major design or implementation decisions visible in the change. */
  majorDecisions: z.array(z.string().min(1).max(500)).max(12),
  /** High-level areas / components touched (e.g. "auth", "pricing API"). */
  areas: z.array(z.string().min(1).max(80)).max(20),
  /** Optional architecture / flow diagrams for the visual report. */
  diagrams: z.array(reportDiagramSchema).max(3)
});

export const changeStatsSchema = z.object({
  filesChanged: z.number().int().min(0),
  additions: z.number().int().min(0),
  deletions: z.number().int().min(0)
});

export const reportSchema = z.object({
  schemaVersion: z.literal(REPORT_SCHEMA_VERSION),
  generatedAt: z.string().min(1),
  tool: z.object({
    name: z.string().min(1),
    version: z.string().min(1)
  }),
  repo: z.object({
    owner: z.string().min(1),
    name: z.string().min(1)
  }),
  pullRequest: z.object({
    number: z.number().int().positive(),
    title: z.string(),
    author: z.string().min(1),
    baseRef: z.string().min(1),
    headRef: z.string().min(1),
    // The viewer fetches the exact diff from these SHAs on the PR tab.
    baseSha: z.string().min(1),
    headSha: z.string().min(1)
  }),
  /** What the PR is about — primary content of the report tab. */
  overview: prOverviewSchema,
  /** Diff size summary for charts (not the full diff). */
  changeStats: changeStatsSchema,
  review: z.object({
    score: z.number().min(0).max(5),
    summary: z.string().min(1),
    model: z.string().min(1),
    truncatedDiff: z.boolean(),
    skippedCommentCount: z.number().int().min(0),
    findings: z.array(reportFindingSchema)
  })
});

export type ReportFinding = z.infer<typeof reportFindingSchema>;
export type ReportDiagram = z.infer<typeof reportDiagramSchema>;
export type PrOverview = z.infer<typeof prOverviewSchema>;
export type ChangeStats = z.infer<typeof changeStatsSchema>;
export type Report = z.infer<typeof reportSchema>;
