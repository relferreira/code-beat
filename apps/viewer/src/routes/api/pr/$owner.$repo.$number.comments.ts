import { createFileRoute } from "@tanstack/react-router";
import { githubErrorResponse, requireGitHubToken } from "../../../lib/api-auth";
import { createIssueComment } from "../../../lib/github-server";

/** POST a conversation (issue) comment on the pull request. */
export const Route = createFileRoute("/api/pr/$owner/$repo/$number/comments")({
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

        const text = typeof body === "object" && body && "body" in body ? String((body as { body: unknown }).body ?? "") : "";
        if (!text.trim()) {
          return Response.json({ error: "body_required" }, { status: 400 });
        }

        try {
          const comment = await createIssueComment(
            { owner: params.owner, repo: params.repo, number: Number(params.number) },
            auth.token,
            text.trim(),
          );
          return Response.json({ comment });
        } catch (error) {
          return githubErrorResponse(error);
        }
      },
    },
  },
});
