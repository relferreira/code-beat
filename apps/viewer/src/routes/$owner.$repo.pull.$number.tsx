import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ReportView } from "../report/ReportView";
import { ApiError, fetchReport, type LoadedReport } from "../report/api";
import { useAuth } from "../lib/auth-client";

export const Route = createFileRoute("/$owner/$repo/pull/$number")({
  component: ReportRoutePage,
});

type State =
  | { status: "loading" }
  | { status: "signin" }
  | { status: "empty" }
  | { status: "error"; message: string }
  | { status: "ready"; data: LoadedReport };

function ReportRoutePage() {
  const { owner, repo, number } = Route.useParams();
  const auth = useAuth();
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    if (!auth.ready) return;
    if (!auth.signedIn) {
      setState({ status: "signin" });
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });

    // Fetch from our own Worker; it proxies GitHub server-side with the session token.
    fetchReport(owner, repo, Number(number))
      .then((data) => {
        if (!cancelled) setState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 401) {
          setState({ status: "signin" });
        } else if (error instanceof ApiError && error.status === 404) {
          setState({ status: "empty" });
        } else {
          setState({ status: "error", message: error instanceof Error ? error.message : String(error) });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [owner, repo, number, auth.ready, auth.signedIn]);

  if (!auth.ready || state.status === "loading") {
    return <Centered auth={auth}>Loading…</Centered>;
  }

  if (state.status === "signin") {
    return (
      <Centered auth={auth}>
        Sign in with GitHub to view the report for {owner}/{repo} #{number}.
      </Centered>
    );
  }

  if (state.status === "empty") {
    return (
      <Centered auth={auth}>
        No Code Beat report found for {owner}/{repo} #{number} yet. It appears once the review
        action runs with <code>report: true</code>.
      </Centered>
    );
  }

  if (state.status === "error") {
    return <Centered auth={auth}>Could not load report: {state.message}</Centered>;
  }

  return (
    <>
      <AuthBar auth={auth} />
      <ReportView report={state.data.report} files={state.data.files} params={{ owner, repo, number }} />
    </>
  );
}

type Auth = ReturnType<typeof useAuth>;

function AuthBar({ auth }: { auth: Auth }) {
  return (
    <div className="authbar">
      <button className="link-button" onClick={auth.signOut}>
        Sign out
      </button>
    </div>
  );
}

function Centered({ children, auth }: { children: React.ReactNode; auth: Auth }) {
  return (
    <main className="container">
      <div className="empty-state">
        <p>{children}</p>
        {!auth.signedIn ? (
          <button className="button" onClick={auth.signIn}>
            Sign in with GitHub
          </button>
        ) : null}
      </div>
    </main>
  );
}
