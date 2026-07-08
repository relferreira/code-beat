import { createFileRoute } from "@tanstack/react-router";
import { githubErrorResponse, requireGitHubToken } from "../../../lib/api-auth";
import { loadPullView } from "../../../lib/github-server";

/**
 * Read-only, session-gated: the pull request, its diff, and its Code Beat report (null when
 * un-reviewed). The Worker fetches from GitHub with the visitor's server-held token and passes
 * the data through — nothing is stored here.
 */
export const Route = createFileRoute("/api/pr/$owner/$repo/$number")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireGitHubToken(request);
        if (!auth.ok) return auth.response;

        try {
          const data = await loadPullView(
            { owner: params.owner, repo: params.repo, number: Number(params.number) },
            auth.token,
          );
          return Response.json(data);
        } catch (error) {
          return githubErrorResponse(error);
        }
      },
    },
  },
});
