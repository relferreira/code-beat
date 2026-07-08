import { useMemo } from "react";
import { FileCard, type FileSource } from "../report/FileCard";
import type { PullDetail, ReviewComment, ViewerFile } from "../report/types";

/**
 * Pull request tab: the description plus every changed file's diff, with review comments
 * threaded inline on their lines — the GitHub view.
 *
 * The body is rendered as preformatted text rather than parsed markdown: it keeps the
 * dependency surface (and XSS surface) at zero. Markdown rendering is a later call.
 */
export function PullFiles({
  pull,
  files,
  comments,
  source,
}: {
  pull: PullDetail;
  files: ViewerFile[];
  comments: ReviewComment[];
  source: FileSource;
}) {
  const body = pull.body.trim();
  const commentsByPath = useMemo(() => groupByPath(comments), [comments]);

  return (
    <div>
      <section className="rounded-xl border border-border bg-surface p-4">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-fg-3">Description</div>
        {body ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg-2">{body}</p>
        ) : (
          <p className="text-sm text-fg-3">No description provided.</p>
        )}
      </section>

      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-sm font-medium text-fg">
          {files.length} changed {files.length === 1 ? "file" : "files"}
          {comments.length > 0 ? (
            <span className="ml-2 font-normal text-fg-3">
              · {comments.length} {comments.length === 1 ? "comment" : "comments"}
            </span>
          ) : null}
        </h2>
        <span className="text-xs text-fg-3">
          <span className="text-good">+{pull.additions}</span>{" "}
          <span className="text-sev-blocker">&minus;{pull.deletions}</span>
        </span>
      </div>

      <div className="mt-3 space-y-6">
        {files.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface px-4 py-10 text-center text-sm text-fg-3">
            No changed files.
          </div>
        ) : (
          files.map((file) => (
            <FileCard key={file.path} file={file} comments={commentsByPath.get(file.path)} source={source} />
          ))
        )}
      </div>
    </div>
  );
}

function groupByPath(comments: ReviewComment[]): Map<string, ReviewComment[]> {
  const map = new Map<string, ReviewComment[]>();
  for (const comment of comments) {
    const bucket = map.get(comment.path);
    if (bucket) bucket.push(comment);
    else map.set(comment.path, [comment]);
  }
  return map;
}
