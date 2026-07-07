import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { createAuth, isAuthConfigured, type AuthEnv } from "../../lib/auth";

/**
 * Mint a short-lived GitHub access token for the signed-in visitor. The browser uses it to
 * call the GitHub API directly for repo content — that data never passes through this
 * Worker. Better Auth refreshes the token from the server-held refresh token if expired.
 */
export const Route = createFileRoute("/api/github-token")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authEnv = env as unknown as AuthEnv;
        // Not configured yet (e.g. no D1 binding): treat as "not signed in" so the client
        // falls back to unauthenticated public reads.
        if (!isAuthConfigured(authEnv)) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }

        const auth = createAuth(authEnv);
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }

        try {
          const { accessToken } = await auth.api.getAccessToken({
            body: { providerId: "github", userId: session.user.id },
            headers: request.headers,
          });
          return Response.json({ token: accessToken });
        } catch {
          return Response.json({ error: "no_github_token" }, { status: 404 });
        }
      },
    },
  },
});
