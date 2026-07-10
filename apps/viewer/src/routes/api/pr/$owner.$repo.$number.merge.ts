import { createFileRoute } from "@tanstack/react-router";
import { githubErrorResponse, requireGitHubToken } from "../../../lib/api-auth";
import { mergePullRequest, type MergeMethod } from "../../../lib/github-server";

const METHODS = new Set<MergeMethod>(["merge", "squash", "rebase"]);

/** PUT merge the pull request (merge commit / squash / rebase). */
export const Route = createFileRoute("/api/pr/$owner/$repo/$number/merge")({
  server: {
    handlers: {
      PUT: async ({ request, params }) => {
        const auth = await requireGitHubToken(request);
        if (!auth.ok) return auth.response;

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "invalid_json" }, { status: 400 });
        }

        const payload = body as {
          mergeMethod?: string;
          commitTitle?: string;
          commitMessage?: string;
          sha?: string;
        };

        const mergeMethod = payload.mergeMethod as MergeMethod | undefined;
        if (!mergeMethod || !METHODS.has(mergeMethod)) {
          return Response.json({ error: "invalid_merge_method" }, { status: 400 });
        }

        try {
          const result = await mergePullRequest(
            { owner: params.owner, repo: params.repo, number: Number(params.number) },
            auth.token,
            {
              mergeMethod,
              commitTitle: payload.commitTitle,
              commitMessage: payload.commitMessage,
              sha: payload.sha,
            },
          );
          return Response.json(result);
        } catch (error) {
          return githubErrorResponse(error);
        }
      },
    },
  },
});
