import { z } from "zod";
import { findingSchema } from "./schema.js";

/**
 * Version of the report.json contract. Bump when the shape changes in a way the
 * viewer must branch on. The viewer reads this before rendering.
 */
export const REPORT_SCHEMA_VERSION = 1;

export const reportFindingSchema = findingSchema.extend({
  /** Whether this finding was posted as an inline PR comment (vs. skipped). */
  posted: z.boolean()
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
    // The viewer fetches the exact diff from these SHAs, client-side, from GitHub.
    baseSha: z.string().min(1),
    headSha: z.string().min(1)
  }),
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
export type Report = z.infer<typeof reportSchema>;
