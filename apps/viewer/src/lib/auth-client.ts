import { createAuthClient } from "better-auth/react";

// Same-origin; endpoints live under /api/auth on this Worker.
export const authClient = createAuthClient();

/**
 * Session-based auth. The GitHub token stays server-side (httpOnly session) — the browser
 * never holds it. Used to gate the report view and drive sign in / out.
 */
export function useAuth() {
  const { data: session, isPending } = authClient.useSession();
  return {
    session,
    ready: !isPending,
    signedIn: Boolean(session),
    signIn: () =>
      authClient.signIn.social({ provider: "github", callbackURL: window.location.href }),
    signOut: () => authClient.signOut().then(() => window.location.reload()),
  };
}
