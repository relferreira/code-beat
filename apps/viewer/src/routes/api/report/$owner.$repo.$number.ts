import { createFileRoute } from "@tanstack/react-router";
import { githubErrorResponse, requireGitHubToken } from "../../../lib/api-auth";
import { loadReport } from "../../../lib/github-server";

/**
 * Read-only, session-gated: returns the report + diff for a PR. The Worker fetches from
 * GitHub with the visitor's server-held token (never exposed to the browser) and passes the
 * data through — nothing is stored here.
 */
export const Route = createFileRoute("/api/report/$owner/$repo/$number")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireGitHubToken(request);
        if (!auth.ok) return auth.response;

        try {
          const data = await loadReport(
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
