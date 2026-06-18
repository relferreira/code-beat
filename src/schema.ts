import { z } from "zod";

export const findingSchema = z.object({
  path: z.string().min(1),
  line: z.number().int().positive(),
  severity: z.enum(["blocker", "major", "minor"]),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(2000)
});

export const agentFindingSchema = findingSchema.extend({
  confidence: z.number().min(0).max(1),
  evidence: z.string().min(1).max(1500),
  category: z.enum(["review", "code-quality"])
});

export const agentReviewSchema = z.object({
  summary: z.string().min(1).max(3000),
  findings: z.array(agentFindingSchema).max(30)
});

export const reviewSchema = z.object({
  score: z.number().min(0).max(5),
  summary: z.string().min(1).max(4000),
  findings: z.array(findingSchema).max(50)
});

export type AgentFinding = z.infer<typeof agentFindingSchema>;
export type AgentReviewResult = z.infer<typeof agentReviewSchema>;
export type ReviewFinding = z.infer<typeof findingSchema>;
export type ReviewResult = z.infer<typeof reviewSchema>;
