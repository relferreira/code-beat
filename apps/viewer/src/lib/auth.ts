import { betterAuth } from "better-auth";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import type { D1Database } from "@cloudflare/workers-types";

/**
 * Cloudflare bindings + secrets this Worker needs for auth. D1 holds only Better Auth's
 * sessions + encrypted GitHub tokens — never repo content.
 */
export interface AuthEnv {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL?: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  MIGRATE_SECRET?: string;
}

/**
 * Build the Better Auth instance per request. D1 bindings only exist inside the request
 * context, so this must NOT be hoisted to module scope — call it inside each handler with
 * the Cloudflare `env`.
 */
export function createAuth(env: AuthEnv) {
  return betterAuth({
    // Native D1 support (better-auth >= 1.5): pass the binding directly.
    database: env.DB,
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    socialProviders: {
      github: {
        // GitHub App: repo access comes from the installation, not OAuth scopes.
        // Better Auth's github provider already requests read:user + user:email.
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
      },
    },
    // Must be the last plugin: handles Set-Cookie for TanStack Start responses.
    plugins: [tanstackStartCookies()],
  });
}

/**
 * Whether the Worker has the bindings/secrets needed for auth. When false (e.g. the D1
 * binding isn't provisioned yet), auth routes short-circuit and the viewer still works for
 * public repos via unauthenticated GitHub reads.
 */
export function isAuthConfigured(env: Partial<AuthEnv>): boolean {
  return Boolean(
    env.DB && env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET && env.BETTER_AUTH_SECRET,
  );
}
