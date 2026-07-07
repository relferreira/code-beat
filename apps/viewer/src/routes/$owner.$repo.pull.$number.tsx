import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ReportView } from "../report/ReportView";
import { GitHubError, loadReport, type LoadedReport } from "../report/github";

export const Route = createFileRoute("/$owner/$repo/pull/$number")({
  component: ReportRoutePage,
});

type State =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "error"; message: string }
  | { status: "ready"; data: LoadedReport };

function ReportRoutePage() {
  const { owner, repo, number } = Route.useParams();
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    // Unauthenticated for now (public repos). The auth phase passes a token here.
    loadReport({ owner, repo, number: Number(number) })
      .then((data) => {
        if (!cancelled) setState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof GitHubError && error.status === 404) {
          setState({ status: "empty" });
        } else {
          setState({ status: "error", message: error instanceof Error ? error.message : String(error) });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [owner, repo, number]);

  if (state.status === "loading") {
    return <Centered>Loading report…</Centered>;
  }

  if (state.status === "empty") {
    return (
      <Centered>
        No Code Beat report found for {owner}/{repo} #{number} yet. It appears once the review
        action runs with <code>report: true</code>.
      </Centered>
    );
  }

  if (state.status === "error") {
    return <Centered>Could not load report: {state.message}</Centered>;
  }

  return (
    <ReportView report={state.data.report} files={state.data.files} params={{ owner, repo, number }} />
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="container">
      <div className="empty-state">{children}</div>
    </main>
  );
}
