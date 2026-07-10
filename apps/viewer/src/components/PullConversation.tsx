import type { ReactNode } from "react";
import { Markdown } from "./Markdown";
import { CommentComposer } from "./pr/CommentComposer";
import { MergeBox } from "./pr/MergeBox";
import { ReviewPanel } from "./pr/ReviewPanel";
import { relativeTime } from "../lib/format";
import type { MergeMethod, ReviewEvent } from "../lib/pr-actions";
import type {
  DraftReviewComment,
  IssueComment,
  PullCommit,
  PullDetail,
  PullReview,
  ReviewComment,
} from "../report/types";

type TimelineItem =
  | { kind: "opened"; at: string; pull: PullDetail }
  | { kind: "commit"; at: string; commit: PullCommit }
  | { kind: "issueComment"; at: string; comment: IssueComment }
  | { kind: "review"; at: string; review: PullReview }
  | { kind: "reviewComment"; at: string; comment: ReviewComment };

/**
 * GitHub-style conversation tab: description, timeline, comment composer,
 * review actions, and merge box.
 */
export function PullConversation({
  pull,
  commits,
  issueComments,
  reviews,
  reviewComments,
  draftComments,
  onRemoveDraft,
  onPostComment,
  onSubmitReview,
  onMerge,
}: {
  pull: PullDetail;
  commits: PullCommit[];
  issueComments: IssueComment[];
  reviews: PullReview[];
  reviewComments: ReviewComment[];
  draftComments: DraftReviewComment[];
  onRemoveDraft: (id: string) => void;
  onPostComment: (body: string) => Promise<void>;
  onSubmitReview: (args: { event: ReviewEvent; body: string }) => Promise<void>;
  onMerge: (args: {
    mergeMethod: MergeMethod;
    commitTitle?: string;
    commitMessage?: string;
  }) => Promise<void>;
}) {
  const body = pull.body.trim();
  const timeline = buildTimeline({ pull, commits, issueComments, reviews, reviewComments });
  const actionsDisabled = pull.state === "closed" || pull.merged;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-6">
        {/* Description card */}
        <section className="overflow-hidden rounded-2xl border border-border bg-surface">
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            <Avatar name={pull.author} src={pull.authorAvatar} />
            <div className="min-w-0 flex-1">
              <div className="text-sm text-fg">
                <span className="font-semibold">{pull.author}</span>
                <span className="text-fg-3"> opened this pull request </span>
                <span className="text-fg-3" title={pull.createdAt}>
                  {relativeTime(pull.createdAt)}
                </span>
              </div>
            </div>
          </div>
          <div className="p-4">
            {body ? (
              <Markdown className="text-sm text-fg-2">{body}</Markdown>
            ) : (
              <p className="text-sm text-fg-3">No description provided.</p>
            )}
          </div>
        </section>

        <div className="flex flex-wrap gap-2 text-xs text-fg-3">
          <MetaChip>
            {commits.length} {commits.length === 1 ? "commit" : "commits"}
          </MetaChip>
          <MetaChip>
            {issueComments.length} conversation {issueComments.length === 1 ? "comment" : "comments"}
          </MetaChip>
          <MetaChip>
            {reviews.length} {reviews.length === 1 ? "review" : "reviews"}
          </MetaChip>
          <MetaChip>
            {reviewComments.length} inline {reviewComments.length === 1 ? "comment" : "comments"}
          </MetaChip>
        </div>

        <div className="relative space-y-0">
          <div className="absolute top-2 bottom-2 left-[15px] w-px bg-border" aria-hidden />
          <ul className="space-y-4">
            {timeline.map((item) => (
              <li key={timelineKey(item)} className="relative pl-10">
                <TimelineDot kind={item.kind} />
                <TimelineEntry item={item} />
              </li>
            ))}
          </ul>
        </div>

        {!actionsDisabled ? (
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-3">Add a comment</h3>
            <CommentComposer
              placeholder="Leave a comment on this pull request…"
              submitLabel="Comment"
              onSubmit={onPostComment}
            />
          </div>
        ) : null}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        {!actionsDisabled ? (
          <ReviewPanel
            draftComments={draftComments}
            onRemoveDraft={onRemoveDraft}
            onSubmit={onSubmitReview}
          />
        ) : null}
        <MergeBox pull={pull} onMerge={onMerge} />
      </aside>
    </div>
  );
}

function buildTimeline(args: {
  pull: PullDetail;
  commits: PullCommit[];
  issueComments: IssueComment[];
  reviews: PullReview[];
  reviewComments: ReviewComment[];
}): TimelineItem[] {
  const items: TimelineItem[] = [
    { kind: "opened", at: args.pull.createdAt, pull: args.pull },
    ...args.commits.map((commit) => ({
      kind: "commit" as const,
      at: commit.committedAt || args.pull.createdAt,
      commit,
    })),
    ...args.issueComments.map((comment) => ({
      kind: "issueComment" as const,
      at: comment.createdAt,
      comment,
    })),
    ...args.reviews.map((review) => ({
      kind: "review" as const,
      at: review.submittedAt,
      review,
    })),
    ...args.reviewComments.map((comment) => ({
      kind: "reviewComment" as const,
      at: comment.createdAt,
      comment,
    })),
  ];

  items.sort((a, b) => {
    const ta = Date.parse(a.at) || 0;
    const tb = Date.parse(b.at) || 0;
    return ta - tb;
  });

  return items;
}

function timelineKey(item: TimelineItem): string {
  switch (item.kind) {
    case "opened":
      return `opened-${item.pull.number}`;
    case "commit":
      return `commit-${item.commit.sha}`;
    case "issueComment":
      return `issue-${item.comment.id}`;
    case "review":
      return `review-${item.review.id}`;
    case "reviewComment":
      return `rc-${item.comment.id}`;
  }
}

function TimelineDot({ kind }: { kind: TimelineItem["kind"] }) {
  const styles: Record<TimelineItem["kind"], string> = {
    opened: "bg-good",
    commit: "bg-sev-minor",
    issueComment: "bg-surface-3 ring-1 ring-border",
    review: "bg-brand",
    reviewComment: "bg-warn",
  };
  return <span className={`absolute top-2 left-2 size-3 rounded-full ${styles[kind]}`} aria-hidden />;
}

function TimelineEntry({ item }: { item: TimelineItem }) {
  switch (item.kind) {
    case "opened":
      return (
        <div className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-fg-2">
          <span className="font-medium text-fg">{item.pull.author}</span> opened this pull request
          <span className="ml-1.5 text-xs text-fg-3" title={item.at}>
            {relativeTime(item.at)}
          </span>
        </div>
      );
    case "commit":
      return <CommitCard commit={item.commit} />;
    case "issueComment":
      return (
        <CommentCard
          author={item.comment.author}
          avatar={item.comment.authorAvatar}
          at={item.comment.createdAt}
          body={item.comment.body}
          href={item.comment.htmlUrl}
        />
      );
    case "review":
      return <ReviewCard review={item.review} />;
    case "reviewComment":
      return (
        <CommentCard
          author={item.comment.author}
          avatar={item.comment.authorAvatar}
          at={item.comment.createdAt}
          body={item.comment.body}
          href={item.comment.htmlUrl}
          meta={`${item.comment.path}:${item.comment.line}`}
        />
      );
  }
}

function CommitCard({ commit }: { commit: PullCommit }) {
  const [subject, ...rest] = commit.message.split("\n");
  const body = rest.join("\n").trim();
  const short = commit.sha.slice(0, 7);

  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Avatar name={commit.author} src={commit.authorAvatar} size="sm" />
            <span className="truncate text-sm font-medium text-fg">{subject}</span>
          </div>
          {body ? <p className="mt-1 line-clamp-2 pl-7 text-xs text-fg-3 whitespace-pre-wrap">{body}</p> : null}
          <div className="mt-1.5 pl-7 text-xs text-fg-3">
            <span className="font-medium text-fg-2">{commit.author}</span>
            {commit.committedAt ? (
              <>
                {" · "}
                <span title={commit.committedAt}>{relativeTime(commit.committedAt)}</span>
              </>
            ) : null}
          </div>
        </div>
        <a
          href={commit.htmlUrl}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-md border border-border bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-fg-2 transition hover:text-fg"
        >
          {short}
        </a>
      </div>
    </div>
  );
}

function ReviewCard({ review }: { review: PullReview }) {
  const { label, className } = reviewStateStyle(review.state);
  const body = review.body.trim();

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <Avatar name={review.author} src={review.authorAvatar} size="sm" />
        <span className="text-sm font-medium text-fg">{review.author}</span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}>{label}</span>
        <span className="text-xs text-fg-3" title={review.submittedAt}>
          {relativeTime(review.submittedAt)}
        </span>
        <a href={review.htmlUrl} target="_blank" rel="noreferrer" className="ml-auto text-xs text-fg-3 hover:text-fg">
          View ↗
        </a>
      </div>
      {body ? (
        <div className="p-3">
          <Markdown className="text-sm text-fg-2">{body}</Markdown>
        </div>
      ) : null}
    </div>
  );
}

function CommentCard({
  author,
  avatar,
  at,
  body,
  href,
  meta,
}: {
  author: string;
  avatar?: string;
  at: string;
  body: string;
  href: string;
  meta?: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <Avatar name={author} src={avatar} size="sm" />
        <span className="text-sm font-medium text-fg">{author}</span>
        <span className="text-xs text-fg-3" title={at}>
          commented {relativeTime(at)}
        </span>
        {meta ? <span className="font-mono text-[11px] text-fg-3">{meta}</span> : null}
        <a href={href} target="_blank" rel="noreferrer" className="ml-auto text-xs text-fg-3 hover:text-fg">
          View ↗
        </a>
      </div>
      <div className="p-3">
        {body.trim() ? (
          <Markdown className="text-sm text-fg-2">{body}</Markdown>
        ) : (
          <p className="text-sm text-fg-3">_(empty comment)_</p>
        )}
      </div>
    </div>
  );
}

function reviewStateStyle(state: string): { label: string; className: string } {
  switch (state.toUpperCase()) {
    case "APPROVED":
      return { label: "Approved", className: "bg-good/12 text-good" };
    case "CHANGES_REQUESTED":
      return { label: "Changes requested", className: "bg-sev-blocker/12 text-sev-blocker" };
    case "DISMISSED":
      return { label: "Dismissed", className: "bg-surface-3 text-fg-3" };
    case "COMMENTED":
    default:
      return { label: "Reviewed", className: "bg-sev-minor/15 text-sev-minor" };
  }
}

function MetaChip({ children }: { children: ReactNode }) {
  return <span className="rounded-full border border-border bg-surface px-2.5 py-1 text-fg-2">{children}</span>;
}

function Avatar({ name, src, size = "md" }: { name: string; src?: string; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "size-5" : "size-8";
  const text = size === "sm" ? "text-[9px]" : "text-xs";
  if (src) {
    return <img src={src} alt="" className={`${dim} shrink-0 rounded-full bg-surface-3`} />;
  }
  const initial = (name[0] ?? "?").toUpperCase();
  return (
    <span
      className={`${dim} ${text} inline-flex shrink-0 items-center justify-center rounded-full bg-surface-3 font-semibold text-fg-2`}
    >
      {initial}
    </span>
  );
}
