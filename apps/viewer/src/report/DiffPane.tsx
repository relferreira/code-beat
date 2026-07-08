import { PatchDiff } from "@pierre/diffs/react";
import type { Theme } from "../lib/theme";

/**
 * Client-only wrapper around @pierre/diffs. Loaded lazily so Shiki never runs during the
 * prerendered shell. A single Shiki theme is passed (matching the app theme) and re-rendered
 * on toggle, so the diff follows our theme switch rather than prefers-color-scheme.
 */
export default function DiffPane({ patch, theme }: { patch: string; theme: Theme }) {
  const shikiTheme = theme === "dark" ? "github-dark" : "github-light";
  return <PatchDiff patch={patch} options={{ theme: shikiTheme }} disableWorkerPool />;
}
