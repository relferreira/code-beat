import { useMemo } from "react";
import { FileCard, type FileSource } from "../report/FileCard";
import { ReviewPanel } from "./pr/ReviewPanel";
import type { MergeMethod, ReviewEvent } from "../lib/pr-actions";
import type { DraftReviewComment, PullDetail, ReviewComment, ViewerFile } from "../report/types";

/**
 * Files tab: diffs with inline comments, draft review comments, and review submit.
 */
export function PullFiles({
  pull,
  files,
  comments,
  source,
  draftComments,
  onAddDraft,
  onRemoveDraft,
  onSubmitReview,
}: {
  pull: PullDetail;
  files: ViewerFile[];
  comments: ReviewComment[];
  source: FileSource;
  draftComments: DraftReviewComment[];
  onAddDraft: (draft: Omit<DraftReviewComment, "id">) => void;
  onRemoveDraft: (id: string) => void;
  onSubmitReview: (args: { event: ReviewEvent; body: string }) => Promise<void>;
  onMerge?: (args: {
    mergeMethod: MergeMethod;
    commitTitle?: string;
    commitMessage?: string;
  }) => Promise<void>;
}) {
  const commentsByPath = useMemo(() => groupByPath(comments), [comments]);
  const draftsByPath = useMemo(() => groupDraftsByPath(draftComments), [draftComments]);
  const actionsDisabled = pull.state === "closed" || pull.merged;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0">
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
              <FileCard
                key={file.path}
                file={file}
                comments={commentsByPath.get(file.path)}
                draftComments={draftsByPath.get(file.path)}
                source={source}
                onAddDraft={actionsDisabled ? undefined : onAddDraft}
              />
            ))
          )}
        </div>
      </div>

      {!actionsDisabled ? (
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <ReviewPanel draftComments={draftComments} onRemoveDraft={onRemoveDraft} onSubmit={onSubmitReview} />
          <p className="mt-3 text-xs text-fg-3">
            Add line comments on files, then submit Approve / Request changes / Comment here.
          </p>
        </aside>
      ) : null}
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

function groupDraftsByPath(drafts: DraftReviewComment[]): Map<string, DraftReviewComment[]> {
  const map = new Map<string, DraftReviewComment[]>();
  for (const draft of drafts) {
    const bucket = map.get(draft.path);
    if (bucket) bucket.push(draft);
    else map.set(draft.path, [draft]);
  }
  return map;
}
