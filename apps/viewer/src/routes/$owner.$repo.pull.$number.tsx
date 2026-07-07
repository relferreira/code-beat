import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ReportView } from "../report/ReportView";
import { GitHubError, loadReport, type LoadedReport } from "../report/github";
import { useGitHubAuth } from "../lib/auth-client";

export const Route = createFileRoute("/$owner/$repo/pull/$number")({
  component: ReportRoutePage,
});

type State =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "notFound" }
  | { status: "error"; message: string }
  | { status: "ready"; data: LoadedReport };

function ReportRoutePage() {
  const { owner, repo, number } = Route.useParams();
  const auth = useGitHubAuth();
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    // Wait until we know whether a token is available so private repos work on first try.
    if (!auth.ready) return;

    let cancelled = false;
    setState({ status: "loading" });

    // Repo content is fetched browser -> GitHub directly, with the visitor's token when
    // signed in. It never passes through the Worker.
    loadReport({ owner, repo, number: Number(number) }, { token: auth.token })
      .then((data) => {
        if (!cancelled) setState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof GitHubError && (error.status === 404 || error.status === 403)) {
          // 404: no report, or a private repo we can't see unauthenticated.
          // 403: unauthenticated rate limit. Both are resolved by signing in.
          setState({ status: auth.signedIn ? "empty" : "notFound" });
        } else {
          setState({ status: "error", message: error instanceof Error ? error.message : String(error) });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [owner, repo, number, auth.ready, auth.token, auth.signedIn]);

  if (!auth.ready || state.status === "loading") {
    return <Centered auth={auth}>Loading report…</Centered>;
  }

  if (state.status === "empty") {
    return (
      <Centered auth={auth}>
        No Code Beat report found for {owner}/{repo} #{number} yet. It appears once the review
        action runs with <code>report: true</code>.
      </Centered>
    );
  }

  if (state.status === "notFound") {
    return (
      <Centered auth={auth}>
        Couldn't load {owner}/{repo} #{number}. If it's a private repository, sign in with GitHub
        to view it.
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

type Auth = ReturnType<typeof useGitHubAuth>;

function AuthBar({ auth }: { auth: Auth }) {
  return (
    <div className="authbar">
      {auth.signedIn ? (
        <button className="link-button" onClick={auth.signOut}>
          Sign out
        </button>
      ) : (
        <button className="link-button" onClick={auth.signIn}>
          Sign in with GitHub
        </button>
      )}
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
