import {
  MultiFileDiff,
  PatchDiff,
  type DiffLineAnnotation,
  type SelectedLineRange,
} from "@pierre/diffs/react";
import type { ReactNode } from "react";
import type { Theme } from "../lib/theme";
import type { DraftReviewComment, ReviewComment } from "./types";

export type LineSide = "LEFT" | "RIGHT";

/** Metadata carried on each line annotation (threads and the open composer). */
export type AnnotationMeta =
  | { kind: "thread"; comments: ReviewComment[]; drafts: DraftReviewComment[] }
  | {
      kind: "composer";
      line: number;
      side: LineSide;
      /** Existing thread on this line, shown above the composer. */
      existing?: { comments: ReviewComment[]; drafts: DraftReviewComment[] };
    };

export type CommentAnnotation = DiffLineAnnotation<AnnotationMeta>;

/**
 * Client-only wrapper around @pierre/diffs. Lazily loaded so Shiki never runs during the
 * prerendered shell.
 *
 * When `onGutterUtilityClick` is set, Pierre shows a GitHub-style + button next to the
 * hovered line number; click (or drag) selects the range and fires the callback.
 */
export default function DiffPane({
  theme,
  fileName,
  patch,
  oldContents,
  newContents,
  annotations,
  renderAnnotation,
  onGutterUtilityClick,
}: {
  theme: Theme;
  fileName: string;
  patch?: string;
  oldContents?: string;
  newContents?: string;
  annotations?: CommentAnnotation[];
  renderAnnotation?: (annotation: CommentAnnotation) => ReactNode;
  onGutterUtilityClick?: (range: SelectedLineRange) => void;
}) {
  const shikiTheme = theme === "dark" ? "github-dark" : "github-light";
  const interactive = Boolean(onGutterUtilityClick);

  const options = {
    theme: shikiTheme,
    overflow: "wrap" as const,
    lineHoverHighlight: interactive ? ("both" as const) : ("disabled" as const),
    enableGutterUtility: interactive,
    onGutterUtilityClick: interactive ? onGutterUtilityClick : undefined,
  };

  if (oldContents !== undefined && newContents !== undefined) {
    return (
      <MultiFileDiff<AnnotationMeta>
        oldFile={{ name: fileName, contents: oldContents }}
        newFile={{ name: fileName, contents: newContents }}
        options={{ ...options, expandUnchanged: true }}
        lineAnnotations={annotations}
        renderAnnotation={renderAnnotation}
        disableWorkerPool
      />
    );
  }

  return (
    <PatchDiff<AnnotationMeta>
      patch={patch ?? ""}
      options={options}
      lineAnnotations={annotations}
      renderAnnotation={renderAnnotation}
      disableWorkerPool
    />
  );
}
