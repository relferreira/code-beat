import type { ReactNode } from "react";
import { AppHeader } from "./AppHeader";
import { LoginScreen } from "./LoginScreen";
import { RepoSidebar, type ActiveTarget } from "./RepoSidebar";
import { useAuth } from "../lib/auth-client";

/** Signed-in app frame: header + repo sidebar + main. Gates on the session. */
export function AppShell({
  active,
  loginSubtitle,
  children,
}: {
  active?: ActiveTarget;
  loginSubtitle?: string;
  children: ReactNode;
}) {
  const auth = useAuth();

  if (!auth.ready) {
    return <div className="grid min-h-dvh place-items-center bg-bg text-sm text-fg-3">Loading…</div>;
  }
  if (!auth.signedIn) {
    return <LoginScreen subtitle={loginSubtitle} />;
  }

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader user={auth.session?.user} onSignOut={auth.signOut} />
      <div className="flex min-h-0 flex-1">
        <RepoSidebar active={active} />
        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
