import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { SEVERITY, relativeTime } from "../lib/format";
import { useTheme } from "../lib/theme";
import { fetchFileContents } from "./api";
import type { CommentAnnotation } from "./DiffPane";
import type { ReportFinding, ReviewComment, ViewerFile } from "./types";

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
  source,
}: {
  file: ViewerFile;
  findings?: ReportFinding[];
  comments?: ReviewComment[];
  source?: FileSource;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { theme } = useTheme();

  const [showFullFile, setShowFullFile] = useState(false);
  const [contents, setContents] = useState<{ old: string; new: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const annotations = useMemo(() => (comments?.length ? buildAnnotations(comments) : undefined), [comments]);
  const canExpand = Boolean(source) && Boolean(file.patch);

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
      // Added files have no base version; removed files have no head version.
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

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <span className="truncate font-mono text-xs text-fg">{file.path}</span>
        <div className="flex shrink-0 items-center gap-3">
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

      {findings?.length ? (
        <ul className="divide-y divide-border border-b border-border">
          {findings.map((finding, i) => (
            <FindingItem key={i} finding={finding} />
          ))}
        </ul>
      ) : null}

      <div className="overflow-x-auto bg-bg">
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
                renderAnnotation={renderCommentThread}
              />
            ) : (
              <DiffPane
                theme={theme}
                fileName={file.path}
                patch={file.patch}
                annotations={annotations}
                renderAnnotation={renderCommentThread}
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

/** Group comments onto one annotation per (side, line) so a thread renders as a single block. */
function buildAnnotations(comments: ReviewComment[]): CommentAnnotation[] {
  const byLine = new Map<string, ReviewComment[]>();
  for (const comment of comments) {
    const side = comment.side === "LEFT" ? "deletions" : "additions";
    const key = `${side}:${comment.line}`;
    const bucket = byLine.get(key);
    if (bucket) bucket.push(comment);
    else byLine.set(key, [comment]);
  }

  return [...byLine.entries()].map(([key, thread]) => {
    const [side, line] = key.split(":");
    return {
      side: side as "deletions" | "additions",
      lineNumber: Number(line),
      metadata: thread,
    };
  });
}

function renderCommentThread(annotation: CommentAnnotation) {
  return <CommentThread comments={annotation.metadata} />;
}

function CommentThread({ comments }: { comments: ReviewComment[] }) {
  return (
    <div className="space-y-3 border-y border-border bg-surface px-4 py-3">
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
            <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed text-fg-2">{comment.body}</p>
          </div>
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
      <p className="mt-1 text-sm leading-relaxed text-fg-2">{finding.body}</p>
    </li>
  );
}

function RawPatch({ patch }: { patch: string }) {
  return <pre className="overflow-x-auto p-4 font-mono text-xs text-fg-2">{patch}</pre>;
}
