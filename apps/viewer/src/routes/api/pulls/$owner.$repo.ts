import { createFileRoute } from "@tanstack/react-router";
import { githubErrorResponse, requireGitHubToken } from "../../../lib/api-auth";
import { listOpenPulls } from "../../../lib/github-server";

/** Read-only, session-gated: list a repo's open pull requests. */
export const Route = createFileRoute("/api/pulls/$owner/$repo")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireGitHubToken(request);
        if (!auth.ok) return auth.response;

        try {
          const pulls = await listOpenPulls(params.owner, params.repo, auth.token);
          return Response.json({ pulls });
        } catch (error) {
          return githubErrorResponse(error);
        }
      },
    },
  },
});
