import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { getMigrations } from "better-auth/db/migration";
import { createAuth, isAuthConfigured, type AuthEnv } from "../../lib/auth";

/**
 * One-time (idempotent) D1 schema setup. The Better Auth CLI can't reach Cloudflare
 * bindings, so migrations run programmatically here. Guarded by MIGRATE_SECRET; call once
 * after deploy: GET /api/migrate?secret=<MIGRATE_SECRET>
 */
export const Route = createFileRoute("/api/migrate")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authEnv = env as unknown as AuthEnv;
        if (!isAuthConfigured(authEnv)) {
          return Response.json({ error: "auth_not_configured" }, { status: 503 });
        }

        const url = new URL(request.url);
        if (!authEnv.MIGRATE_SECRET || url.searchParams.get("secret") !== authEnv.MIGRATE_SECRET) {
          return Response.json({ error: "forbidden" }, { status: 403 });
        }

        const auth = createAuth(authEnv);
        const { runMigrations } = await getMigrations(auth.options);
        await runMigrations();
        return Response.json({ ok: true });
      },
    },
  },
});
