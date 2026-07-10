import { useMemo } from "react";
import { FileCard, type FileSource } from "../report/FileCard";
import type { PullDetail, ReviewComment, ViewerFile } from "../report/types";

/**
 * Files tab: every changed file's diff with inline review comments.
 * Description and conversation live on the Conversation tab.
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
  const commentsByPath = useMemo(() => groupByPath(comments), [comments]);

  return (
    <div>
      <div className="flex items-center justify-between">
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
