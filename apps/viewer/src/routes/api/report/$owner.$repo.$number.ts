import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { createAuth, isAuthConfigured, type AuthEnv } from "../../../lib/auth";
import { GitHubError, loadReport } from "../../../lib/github-server";

/**
 * Read-only, session-gated: returns the report + diff for a PR. The Worker fetches from
 * GitHub with the visitor's server-held token (never exposed to the browser) and passes
 * the data through — nothing is stored here.
 */
export const Route = createFileRoute("/api/report/$owner/$repo/$number")({
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
          const data = await loadReport(
            { owner: params.owner, repo: params.repo, number: Number(params.number) },
            token,
          );
          return Response.json(data);
        } catch (error) {
          if (error instanceof GitHubError) {
            // 404 (no report / no access) passes through; other GitHub failures are 502.
            return Response.json({ error: "github_error" }, { status: error.status === 404 ? 404 : 502 });
          }
          return Response.json({ error: "internal_error" }, { status: 500 });
        }
      },
    },
  },
});
