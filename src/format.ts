import type { ReviewFinding, ReviewResult } from "./schema.js";

export function formatReviewBody(args: {
  result: ReviewResult;
  postedComments: ReviewFinding[];
  skippedCommentCount: number;
  truncatedDiff: boolean;
}): string {
  const lines = [
    "## Code Beat review",
    "",
    `Score: ${args.result.score}/5`,
    "",
    args.result.summary.trim()
  ];

  if (args.postedComments.length > 0) {
    lines.push("", `Inline comments posted: ${args.postedComments.length}`);
  }

  if (args.skippedCommentCount > 0) {
    lines.push(
      "",
      `Skipped inline comments: ${args.skippedCommentCount} finding(s) were not on added diff lines or exceeded the max-comments limit.`
    );
  }

  if (args.truncatedDiff) {
    lines.push("", "Note: the diff was truncated before model review because it exceeded the action context limit.");
  }

  return lines.join("\n");
}

export function formatInlineComment(finding: ReviewFinding): string {
  return `**${finding.severity}: ${finding.title}**\n\n${finding.body.trim()}`;
}
