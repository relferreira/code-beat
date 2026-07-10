import { createFileRoute } from "@tanstack/react-router";
import { githubErrorResponse, requireGitHubToken } from "../../../lib/api-auth";
import { createReviewComment } from "../../../lib/github-server";

/** POST a single inline review comment on a diff line (or a reply). */
export const Route = createFileRoute("/api/pr/$owner/$repo/$number/review-comments")({
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
          body?: string;
          path?: string;
          line?: number;
          side?: string;
          commitId?: string;
          inReplyTo?: number;
        };

        const text = String(payload.body ?? "").trim();
        const path = String(payload.path ?? "").trim();
        const line = Number(payload.line);
        const commitId = String(payload.commitId ?? "").trim();

        if (!text || !path || !commitId || !Number.isFinite(line) || line < 1) {
          return Response.json({ error: "invalid_comment" }, { status: 400 });
        }

        try {
          const comment = await createReviewComment(
            { owner: params.owner, repo: params.repo, number: Number(params.number) },
            auth.token,
            {
              body: text,
              path,
              line: Math.floor(line),
              side: payload.side === "LEFT" ? "LEFT" : "RIGHT",
              commitId,
              inReplyTo: payload.inReplyTo,
            },
          );
          return Response.json({ comment });
        } catch (error) {
          return githubErrorResponse(error);
        }
      },
    },
  },
});
