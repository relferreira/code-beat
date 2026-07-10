import { createFileRoute } from "@tanstack/react-router";
import { githubErrorResponse, requireGitHubToken } from "../../../lib/api-auth";
import { createPullReview, type ReviewCommentInput, type ReviewEvent } from "../../../lib/github-server";

const EVENTS = new Set<ReviewEvent>(["APPROVE", "REQUEST_CHANGES", "COMMENT"]);

/** POST a pull request review (approve / request changes / comment), optionally with inline comments. */
export const Route = createFileRoute("/api/pr/$owner/$repo/$number/reviews")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireGitHubToken(request);
        if (!auth.ok) return auth.response;

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "invalid_json" }, { status: 400 });
        }

        const payload = body as {
          event?: string;
          body?: string;
          commitId?: string;
          comments?: Array<{ path?: string; body?: string; line?: number; side?: string }>;
        };

        const event = payload.event as ReviewEvent | undefined;
        if (!event || !EVENTS.has(event)) {
          return Response.json({ error: "invalid_event" }, { status: 400 });
        }

        const reviewBody = String(payload.body ?? "").trim();
        if ((event === "REQUEST_CHANGES" || event === "COMMENT") && !reviewBody) {
          return Response.json({ error: "body_required" }, { status: 400 });
        }

        const comments: ReviewCommentInput[] = [];
        for (const c of payload.comments ?? []) {
          const path = String(c.path ?? "").trim();
          const text = String(c.body ?? "").trim();
          const line = Number(c.line);
          if (!path || !text || !Number.isFinite(line) || line < 1) continue;
          comments.push({
            path,
            body: text,
            line: Math.floor(line),
            side: c.side === "LEFT" ? "LEFT" : "RIGHT",
          });
        }

        try {
          const review = await createPullReview(
            { owner: params.owner, repo: params.repo, number: Number(params.number) },
            auth.token,
            {
              event,
              body: reviewBody || undefined,
              commitId: payload.commitId,
              comments: comments.length > 0 ? comments : undefined,
            },
          );
          return Response.json({ review });
        } catch (error) {
          return githubErrorResponse(error);
        }
      },
    },
  },
});
