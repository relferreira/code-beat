import { z } from "zod";

export const findingSchema = z.object({
  path: z.string().min(1),
  line: z.number().int().positive(),
  severity: z.enum(["blocker", "major", "minor"]),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(2000)
});

export const reviewSchema = z.object({
  score: z.number().min(0).max(5),
  summary: z.string().min(1).max(4000),
  findings: z.array(findingSchema).max(50)
});

export type ReviewFinding = z.infer<typeof findingSchema>;
export type ReviewResult = z.infer<typeof reviewSchema>;
