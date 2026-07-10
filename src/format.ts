import type { PrOverview } from "./report-schema.js";
import type { ReviewFinding, ReviewResult } from "./schema.js";

export function formatReviewBody(args: {
  result: ReviewResult;
  postedComments: ReviewFinding[];
  skippedCommentCount: number;
  truncatedDiff: boolean;
  viewerUrl?: string;
  /** When present, surface a one-line PR overview above the review summary. */
  overview?: PrOverview;
}): string {
  const tone = getScoreTone(args.result.score);
  const lines = [
    `## ${tone.emoji} Code Beat review`,
    "",
    `**Score:** ${tone.badge} **${args.result.score}/5** - ${tone.label}`,
    ""
  ];

  if (args.overview?.headline) {
    lines.push(`**What this PR does:** ${args.overview.headline.trim()}`, "");
  }

  lines.push(args.result.summary.trim());

  if (args.viewerUrl) {
    lines.push("", `📊 **[View the full report and diff](${args.viewerUrl})**`);
  }

  if (args.postedComments.length > 0) {
    lines.push("", `🎯 **Inline comments posted:** ${args.postedComments.length}`);
  } else {
    lines.push("", "✨ **No inline comments from me.** This one kept the beat clean.");
  }

  if (args.skippedCommentCount > 0) {
    lines.push(
      "",
      `🧹 **Skipped inline comments:** ${args.skippedCommentCount} finding(s) were not on added diff lines or exceeded the max-comments limit.`
    );
  }

  if (args.truncatedDiff) {
    lines.push("", "📎 **Note:** the diff was truncated before model review because it exceeded the action context limit.");
  }

  lines.push("", "_Reviewed by Code Beat. Tiny drumsticks, serious standards._");

  return lines.join("\n");
}

export function formatInlineComment(finding: ReviewFinding): string {
  return `**${severityEmoji(finding.severity)} ${finding.severity}: ${finding.title}**\n\n${finding.body.trim()}`;
}

function getScoreTone(score: number): { emoji: string; badge: string; label: string } {
  if (score >= 5) {
    return {
      emoji: "🥁",
      badge: "🟢",
      label: "Ship-shape"
    };
  }

  if (score >= 4) {
    return {
      emoji: "🎵",
      badge: "🟢",
      label: "Solid rhythm"
    };
  }

  if (score >= 3) {
    return {
      emoji: "🎧",
      badge: "🟡",
      label: "Mostly in tune"
    };
  }

  if (score >= 2) {
    return {
      emoji: "🥁",
      badge: "🟠",
      label: "Needs another pass"
    };
  }

  return {
    emoji: "🚨",
    badge: "🔴",
    label: "Please do not merge yet"
  };
}

function severityEmoji(severity: ReviewFinding["severity"]): string {
  if (severity === "blocker") {
    return "🚨";
  }

  if (severity === "major") {
    return "⚠️";
  }

  return "💡";
}
