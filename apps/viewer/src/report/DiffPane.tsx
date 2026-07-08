import { MultiFileDiff, PatchDiff, type DiffLineAnnotation } from "@pierre/diffs/react";
import type { ReactNode } from "react";
import type { Theme } from "../lib/theme";
import type { ReviewComment } from "./types";

export type CommentAnnotation = DiffLineAnnotation<ReviewComment[]>;

/**
 * Client-only wrapper around @pierre/diffs. Lazily loaded so Shiki never runs during the
 * prerendered shell.
 *
 * Two modes:
 *  - `patch`: GitHub's unified patch — only the changed hunks (3 lines of context).
 *  - `oldContents`/`newContents`: whole-file contents, so the diff is computed locally and
 *    every unmodified line can be shown (`expandUnchanged`). GitHub's API can't widen the
 *    patch context, so full context requires the file itself.
 *
 * A single Shiki theme matching the app theme is passed and re-rendered on toggle.
 */
export default function DiffPane({
  theme,
  fileName,
  patch,
  oldContents,
  newContents,
  annotations,
  renderAnnotation,
}: {
  theme: Theme;
  fileName: string;
  patch?: string;
  oldContents?: string;
  newContents?: string;
  annotations?: CommentAnnotation[];
  renderAnnotation?: (annotation: CommentAnnotation) => ReactNode;
}) {
  const shikiTheme = theme === "dark" ? "github-dark" : "github-light";

  if (oldContents !== undefined && newContents !== undefined) {
    return (
      <MultiFileDiff<ReviewComment[]>
        oldFile={{ name: fileName, contents: oldContents }}
        newFile={{ name: fileName, contents: newContents }}
        options={{ theme: shikiTheme, expandUnchanged: true }}
        lineAnnotations={annotations}
        renderAnnotation={renderAnnotation}
        disableWorkerPool
      />
    );
  }

  return (
    <PatchDiff<ReviewComment[]>
      patch={patch ?? ""}
      options={{ theme: shikiTheme }}
      lineAnnotations={annotations}
      renderAnnotation={renderAnnotation}
      disableWorkerPool
    />
  );
}
