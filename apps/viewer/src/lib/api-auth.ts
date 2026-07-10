import { env } from "cloudflare:workers";
import { createAuth, isAuthConfigured, type AuthEnv } from "./auth";
import { GitHubError } from "./github-server";

export type TokenResult = { ok: true; token: string } | { ok: false; response: Response };

/**
 * Guard for read-only data routes: verifies auth is configured, resolves the session, and
 * mints the visitor's GitHub token server-side. The token never leaves the Worker.
 */
export async function requireGitHubToken(request: Request): Promise<TokenResult> {
  const authEnv = env as unknown as AuthEnv;
  if (!isAuthConfigured(authEnv)) {
    return { ok: false, response: Response.json({ error: "auth_not_configured" }, { status: 503 }) };
  }

  const auth = createAuth(authEnv);
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return { ok: false, response: Response.json({ error: "unauthorized" }, { status: 401 }) };
  }

  try {
    const result = await auth.api.getAccessToken({
      body: { providerId: "github", userId: session.user.id },
      headers: request.headers,
    });
    return { ok: true, token: result.accessToken };
  } catch {
    return { ok: false, response: Response.json({ error: "no_github_token" }, { status: 401 }) };
  }
}

/** Map a GitHub failure onto a client-safe status, including the GitHub message when available. */
export function githubErrorResponse(error: unknown): Response {
  if (error instanceof GitHubError) {
    const status =
      error.status === 404
        ? 404
        : error.status === 403 || error.status === 401
          ? error.status
          : error.status === 422 || error.status === 405 || error.status === 409
            ? error.status
            : 502;
    return Response.json({ error: "github_error", message: error.message }, { status });
  }
  return Response.json({ error: "internal_error" }, { status: 500 });
}
