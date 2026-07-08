import { createFileRoute } from "@tanstack/react-router";
import { githubErrorResponse, requireGitHubToken } from "../../lib/api-auth";
import { listUserRepos } from "../../lib/github-server";

/** Read-only, session-gated: repos the user can reach (scoped to Code Beat installations). */
export const Route = createFileRoute("/api/repos")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireGitHubToken(request);
        if (!auth.ok) return auth.response;

        try {
          const repos = await listUserRepos(auth.token);
          return Response.json({ repos });
        } catch (error) {
          return githubErrorResponse(error);
        }
      },
    },
  },
});
