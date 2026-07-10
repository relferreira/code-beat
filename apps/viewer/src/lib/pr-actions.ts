import type { DraftReviewComment, IssueComment, PullReview, ReviewComment } from "../report/types";
import { ApiError } from "../report/api";

export type ReviewEvent = "APPROVE" | "REQUEST_CHANGES" | "COMMENT";
export type MergeMethod = "merge" | "squash" | "rebase";

async function mutate<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    let message = `API ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string; error?: string };
      message = body.message || body.error || message;
    } catch {
      // ignore
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}

export async function postIssueComment(
  owner: string,
  repo: string,
  number: number,
  body: string,
): Promise<IssueComment> {
  const result = await mutate<{ comment: IssueComment }>(`/api/pr/${owner}/${repo}/${number}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
  return result.comment;
}

export async function postPullReview(
  owner: string,
  repo: string,
  number: number,
  args: {
    event: ReviewEvent;
    body?: string;
    commitId?: string;
    comments?: DraftReviewComment[];
  },
): Promise<PullReview> {
  const result = await mutate<{ review: PullReview }>(`/api/pr/${owner}/${repo}/${number}/reviews`, {
    method: "POST",
    body: JSON.stringify({
      event: args.event,
      body: args.body,
      commitId: args.commitId,
      comments: args.comments?.map((c) => ({
        path: c.path,
        body: c.body,
        line: c.line,
        side: c.side,
      })),
    }),
  });
  return result.review;
}

export async function postReviewComment(
  owner: string,
  repo: string,
  number: number,
  args: {
    body: string;
    path: string;
    line: number;
    side?: "LEFT" | "RIGHT";
    commitId: string;
    inReplyTo?: number;
  },
): Promise<ReviewComment> {
  const result = await mutate<{ comment: ReviewComment }>(
    `/api/pr/${owner}/${repo}/${number}/review-comments`,
    {
      method: "POST",
      body: JSON.stringify(args),
    },
  );
  return result.comment;
}

export async function mergePull(
  owner: string,
  repo: string,
  number: number,
  args: {
    mergeMethod: MergeMethod;
    commitTitle?: string;
    commitMessage?: string;
    sha?: string;
  },
): Promise<{ sha: string; merged: boolean; message: string }> {
  return mutate(`/api/pr/${owner}/${repo}/${number}/merge`, {
    method: "PUT",
    body: JSON.stringify(args),
  });
}
