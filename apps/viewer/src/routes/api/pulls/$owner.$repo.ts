import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { createAuth, isAuthConfigured, type AuthEnv } from "../../../lib/auth";
import { GitHubError, listOpenPulls } from "../../../lib/github-server";

/** Read-only, session-gated: list a repo's open pull requests for the sidebar. */
export const Route = createFileRoute("/api/pulls/$owner/$repo")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const authEnv = env as unknown as AuthEnv;
        if (!isAuthConfigured(authEnv)) {
          return Response.json({ error: "auth_not_configured" }, { status: 503 });
        }

        const auth = createAuth(authEnv);
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }

        let token: string;
        try {
          const result = await auth.api.getAccessToken({
            body: { providerId: "github", userId: session.user.id },
            headers: request.headers,
          });
          token = result.accessToken;
        } catch {
          return Response.json({ error: "no_github_token" }, { status: 401 });
        }

        try {
          const pulls = await listOpenPulls(params.owner, params.repo, token);
          return Response.json({ pulls });
        } catch (error) {
          if (error instanceof GitHubError) {
            return Response.json({ error: "github_error" }, { status: error.status === 404 ? 404 : 502 });
          }
          return Response.json({ error: "internal_error" }, { status: 500 });
        }
      },
    },
  },
});
