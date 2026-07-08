import { createFileRoute } from "@tanstack/react-router";
import { githubErrorResponse, requireGitHubToken } from "../../../lib/api-auth";
import { getFileContents } from "../../../lib/github-server";

/**
 * Read-only, session-gated: whole-file contents at a ref, used for full-context diffs.
 * `path` and `ref` are query params because file paths contain slashes.
 */
export const Route = createFileRoute("/api/file/$owner/$repo")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireGitHubToken(request);
        if (!auth.ok) return auth.response;

        const url = new URL(request.url);
        const path = url.searchParams.get("path");
        const ref = url.searchParams.get("ref");
        if (!path || !ref) {
          return Response.json({ error: "missing_path_or_ref" }, { status: 400 });
        }

        try {
          const contents = await getFileContents(params.owner, params.repo, path, ref, auth.token);
          return Response.json({ contents });
        } catch (error) {
          return githubErrorResponse(error);
        }
      },
    },
  },
});
