import type { Severity } from "../report/types";

export type ScoreKey = "good" | "warn" | "major" | "blocker";

export function scoreTone(score: number): { label: string; key: ScoreKey } {
  if (score >= 4) return { label: score >= 5 ? "Ship-shape" : "Solid rhythm", key: "good" };
  if (score >= 3) return { label: "Mostly in tune", key: "warn" };
  if (score >= 2) return { label: "Needs another pass", key: "major" };
  return { label: "Please do not merge yet", key: "blocker" };
}

// Literal class strings so Tailwind can detect them.
export const SCORE_PILL: Record<ScoreKey, string> = {
  good: "bg-good/12 text-good",
  warn: "bg-warn/15 text-warn",
  major: "bg-sev-major/15 text-sev-major",
  blocker: "bg-sev-blocker/12 text-sev-blocker",
};

export const SCORE_DOT: Record<ScoreKey, string> = {
  good: "bg-good",
  warn: "bg-warn",
  major: "bg-sev-major",
  blocker: "bg-sev-blocker",
};

export const SEVERITY: Record<Severity, { label: string; dot: string }> = {
  blocker: { label: "Blocker", dot: "bg-sev-blocker" },
  major: { label: "Major", dot: "bg-sev-major" },
  minor: { label: "Minor", dot: "bg-sev-minor" },
};

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.round((Date.now() - then) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}
