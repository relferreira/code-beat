import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import type { SelectedLineRange } from "@pierre/diffs/react";
import { Markdown } from "../components/Markdown";
import { InlineCommentComposer } from "../components/pr/InlineCommentComposer";
import { SEVERITY, relativeTime } from "../lib/format";
import { useTheme } from "../lib/theme";
import { fetchFileContents } from "./api";
import type { AnnotationMeta, CommentAnnotation, LineSide } from "./DiffPane";
import type { DraftReviewComment, ReportFinding, ReviewComment, ViewerFile } from "./types";

const DiffPane = lazy(() => import("./DiffPane"));

/** Where to fetch whole-file contents from, when expanding to full context. */
export interface FileSource {
  owner: string;
  repo: string;
  baseSha: string;
  headSha: string;
}

/** One changed file: header, optional Code Beat findings, and the diff. Shared by both tabs. */
export function FileCard({
  file,
  findings,
  comments,
  draftComments,
  source,
  onAddDraft,
}: {
  file: ViewerFile;
  findings?: ReportFinding[];
  comments?: ReviewComment[];
  draftComments?: DraftReviewComment[];
  source?: FileSource;
  onAddDraft?: (draft: Omit<DraftReviewComment, "id">) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { theme } = useTheme();

  const [showFullFile, setShowFullFile] = useState(false);
  const [contents, setContents] = useState<{ old: string; new: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  /** Open inline composer target (from the gutter + button). */
  const [composing, setComposing] = useState<{ line: number; side: LineSide } | null>(null);

  const canExpand = Boolean(source) && Boolean(file.patch);
  const canComment = Boolean(onAddDraft);

  const annotations = useMemo(
    () => buildAnnotations(comments, draftComments, composing),
    [comments, draftComments, composing],
  );

  const handleGutterUtilityClick = useCallback(
    (range: SelectedLineRange) => {
      if (!onAddDraft) return;
      const line = range.end;
      const annotationSide = range.endSide ?? range.side ?? "additions";
      const side: LineSide = annotationSide === "deletions" ? "LEFT" : "RIGHT";
      setComposing({ line, side });
    },
    [onAddDraft],
  );

  const renderAnnotation = useCallback(
    (annotation: CommentAnnotation) => {
      const meta = annotation.metadata;
      if (meta.kind === "composer") {
        return (
          <div>
            {meta.existing && (meta.existing.comments.length > 0 || meta.existing.drafts.length > 0) ? (
              <CommentThread comments={meta.existing.comments} drafts={meta.existing.drafts} />
            ) : null}
            <InlineCommentComposer
              path={file.path}
              line={meta.line}
              side={meta.side}
              onCancel={() => setComposing(null)}
              onSubmit={(body) => {
                onAddDraft?.({
                  path: file.path,
                  line: meta.line,
                  side: meta.side,
                  body,
                });
                setComposing(null);
              }}
            />
          </div>
        );
      }
      return <CommentThread comments={meta.comments} drafts={meta.drafts} />;
    },
    [file.path, onAddDraft],
  );

  async function toggleFullFile() {
    if (showFullFile) {
      setShowFullFile(false);
      return;
    }
    if (contents) {
      setShowFullFile(true);
      return;
    }
    if (!source) return;

    setLoading(true);
    setFailed(false);
    try {
      const [oldContents, newContents] = await Promise.all([
        file.status === "added"
          ? Promise.resolve("")
          : fetchFileContents(source.owner, source.repo, file.path, source.baseSha),
        file.status === "removed"
          ? Promise.resolve("")
          : fetchFileContents(source.owner, source.repo, file.path, source.headSha),
      ]);
      setContents({ old: oldContents, new: newContents });
      setShowFullFile(true);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  const draftCount = draftComments?.length ?? 0;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <span className="truncate font-mono text-xs text-fg">{file.path}</span>
        <div className="flex shrink-0 items-center gap-3">
          {draftCount > 0 ? (
            <span className="rounded-full bg-brand/12 px-2 py-0.5 text-[11px] font-medium text-brand">
              {draftCount} pending
            </span>
          ) : null}
          {failed ? <span className="text-xs text-sev-blocker">Couldn&apos;t load file</span> : null}
          <span className="text-xs text-fg-3">{file.status}</span>
          {canExpand ? (
            <button
              onClick={toggleFullFile}
              disabled={loading}
              className="rounded-md border border-border px-2 py-0.5 text-xs text-fg-2 transition hover:bg-surface-2 hover:text-fg disabled:opacity-50"
            >
              {loading ? "Loading…" : showFullFile ? "Show changes only" : "Show full file"}
            </button>
          ) : null}
        </div>
      </div>

      {canComment ? (
        <div className="border-b border-border bg-surface-2 px-4 py-1.5 text-[11px] text-fg-3">
          Hover a line number and click <span className="font-semibold text-fg-2">+</span> to comment —
          then submit the review from the sidebar.
        </div>
      ) : null}

      {findings?.length ? (
        <ul className="divide-y divide-border border-b border-border">
          {findings.map((finding, i) => (
            <FindingItem key={i} finding={finding} />
          ))}
        </ul>
      ) : null}

      <div className="bg-bg">
        {!file.patch ? (
          <div className="px-4 py-3 text-sm text-fg-3">No diff available for this file.</div>
        ) : mounted ? (
          <Suspense fallback={<RawPatch patch={file.patch} />}>
            {showFullFile && contents ? (
              <DiffPane
                theme={theme}
                fileName={file.path}
                oldContents={contents.old}
                newContents={contents.new}
                annotations={annotations}
                renderAnnotation={renderAnnotation}
                onGutterUtilityClick={canComment ? handleGutterUtilityClick : undefined}
              />
            ) : (
              <DiffPane
                theme={theme}
                fileName={file.path}
                patch={file.patch}
                annotations={annotations}
                renderAnnotation={renderAnnotation}
                onGutterUtilityClick={canComment ? handleGutterUtilityClick : undefined}
              />
            )}
          </Suspense>
        ) : (
          <RawPatch patch={file.patch} />
        )}
      </div>
    </section>
  );
}

function buildAnnotations(
  comments: ReviewComment[] | undefined,
  drafts: DraftReviewComment[] | undefined,
  composing: { line: number; side: LineSide } | null,
): CommentAnnotation[] {
  const byLine = new Map<string, { comments: ReviewComment[]; drafts: DraftReviewComment[] }>();

  for (const comment of comments ?? []) {
    const side = comment.side === "LEFT" ? "deletions" : "additions";
    const key = `${side}:${comment.line}`;
    const bucket = byLine.get(key) ?? { comments: [], drafts: [] };
    bucket.comments.push(comment);
    byLine.set(key, bucket);
  }

  for (const draft of drafts ?? []) {
    const side = draft.side === "LEFT" ? "deletions" : "additions";
    const key = `${side}:${draft.line}`;
    const bucket = byLine.get(key) ?? { comments: [], drafts: [] };
    bucket.drafts.push(draft);
    byLine.set(key, bucket);
  }

  const annotations: CommentAnnotation[] = [...byLine.entries()].map(([key, thread]) => {
    const [side, line] = key.split(":");
    return {
      side: side as "deletions" | "additions",
      lineNumber: Number(line),
      metadata: { kind: "thread" as const, comments: thread.comments, drafts: thread.drafts },
    };
  });

  if (composing) {
    const side = composing.side === "LEFT" ? "deletions" : "additions";
    const existingIdx = annotations.findIndex((a) => a.side === side && a.lineNumber === composing.line);
    const existingMeta =
      existingIdx >= 0 && annotations[existingIdx]!.metadata.kind === "thread"
        ? annotations[existingIdx]!.metadata
        : undefined;
    const composer: CommentAnnotation = {
      side,
      lineNumber: composing.line,
      metadata: {
        kind: "composer",
        line: composing.line,
        side: composing.side,
        existing:
          existingMeta && existingMeta.kind === "thread"
            ? { comments: existingMeta.comments, drafts: existingMeta.drafts }
            : undefined,
      },
    };
    if (existingIdx >= 0) annotations[existingIdx] = composer;
    else annotations.push(composer);
  }

  return annotations;
}

function CommentThread({
  comments,
  drafts,
}: {
  comments: ReviewComment[];
  drafts: DraftReviewComment[];
}) {
  return (
    <div
      className="space-y-3 border-y border-border bg-surface px-4 py-3"
      style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
    >
      {comments.map((comment) => (
        <div key={comment.id} className="flex gap-2.5">
          <span className="size-6 shrink-0 overflow-hidden rounded-full bg-surface-3">
            {comment.authorAvatar ? (
              <img src={comment.authorAvatar} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
            ) : null}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <a
                href={comment.htmlUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-medium text-fg hover:underline"
              >
                {comment.author}
              </a>
              <span className="text-[11px] text-fg-3">{relativeTime(comment.createdAt)}</span>
            </div>
            <Markdown className="mt-1 text-[13px] text-fg-2">{comment.body}</Markdown>
          </div>
        </div>
      ))}
      {drafts.map((draft) => (
        <div key={draft.id} className="rounded-lg border border-brand/25 bg-brand/8 px-3 py-2">
          <div className="text-[11px] font-medium text-brand">Pending review comment</div>
          <p className="mt-1 text-[13px] text-fg-2 whitespace-pre-wrap">{draft.body}</p>
        </div>
      ))}
    </div>
  );
}

function FindingItem({ finding }: { finding: ReportFinding }) {
  const sev = SEVERITY[finding.severity];
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`size-2 rounded-full ${sev.dot}`} />
        <span className="text-sm font-medium text-fg">{finding.title}</span>
        <span className="font-mono text-xs text-fg-3">
          {finding.path}:{finding.line}
        </span>
        {!finding.posted ? (
          <span className="rounded-full border border-border px-1.5 text-[10px] font-medium uppercase tracking-wide text-fg-3">
            not posted
          </span>
        ) : null}
      </div>
      <Markdown className="mt-1 text-sm text-fg-2">{finding.body}</Markdown>
    </li>
  );
}

function RawPatch({ patch }: { patch: string }) {
  return <pre className="overflow-x-auto p-4 font-mono text-xs text-fg-2">{patch}</pre>;
}
