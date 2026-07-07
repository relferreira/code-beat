import { createAuthClient } from "better-auth/react";
import { useEffect, useState } from "react";

// Same-origin; endpoints live under /api/auth on this Worker.
export const authClient = createAuthClient();

/**
 * Client hook: fetches a short-lived GitHub access token from the Worker (which mints it
 * from the server-held refresh token). The token is held in memory only — never persisted.
 * Returns `undefined` when the visitor is not signed in.
 */
export function useGitHubAuth() {
  const [token, setToken] = useState<string | undefined>(undefined);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/github-token", { credentials: "include" })
      .then(async (res) => {
        if (!cancelled && res.ok) {
          const body = (await res.json()) as { token?: string };
          setToken(body.token);
        }
      })
      .catch(() => {
        /* not signed in / network error: leave token undefined */
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    token,
    ready,
    signedIn: token !== undefined,
    signIn: () =>
      authClient.signIn.social({ provider: "github", callbackURL: window.location.href }),
    signOut: () => authClient.signOut().then(() => window.location.reload()),
  };
}
