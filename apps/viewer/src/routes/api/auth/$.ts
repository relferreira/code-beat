import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { createAuth, isAuthConfigured, type AuthEnv } from "../../../lib/auth";

function handle(request: Request): Response | Promise<Response> {
  const authEnv = env as unknown as AuthEnv;
  if (!isAuthConfigured(authEnv)) {
    return Response.json({ error: "auth_not_configured" }, { status: 503 });
  }
  return createAuth(authEnv).handler(request);
}

// Better Auth mounts all of its endpoints under /api/auth/*.
export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});
