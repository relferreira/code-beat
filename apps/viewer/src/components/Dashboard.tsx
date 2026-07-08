import { useEffect, useState } from "react";
import { DashboardView, CenterMessage } from "./DashboardView";
import { LoginScreen } from "./LoginScreen";
import { ReportPanel } from "../report/ReportPanel";
import { ApiError, fetchOpenPulls, fetchReport, type LoadedReport } from "../report/api";
import { useAuth } from "../lib/auth-client";
import type { PullSummary } from "../report/types";

type ReportState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "signin" }
  | { status: "noPulls" }
  | { status: "error"; message: string }
  | { status: "ready"; data: LoadedReport };

export function Dashboard({ owner, repo, number }: { owner: string; repo: string; number?: number }) {
  const auth = useAuth();
  const [pulls, setPulls] = useState<PullSummary[]>([]);
  const [pullsLoading, setPullsLoading] = useState(true);
  const [report, setReport] = useState<ReportState>({ status: "loading" });

  const active = auth.ready && auth.signedIn;

  // Open PRs for the sidebar.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setPullsLoading(true);
    fetchOpenPulls(owner, repo)
      .then((p) => !cancelled && setPulls(p))
      .catch(() => !cancelled && setPulls([]))
      .finally(() => !cancelled && setPullsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [owner, repo, active]);

  // Selected PR: the one in the URL, else the latest open PR.
  const selected = number ?? pulls[0]?.number;

  useEffect(() => {
    if (!active) return;
    if (selected == null) {
      setReport(pullsLoading ? { status: "loading" } : { status: "noPulls" });
      return;
    }
    let cancelled = false;
    setReport({ status: "loading" });
    fetchReport(owner, repo, selected)
      .then((data) => !cancelled && setReport({ status: "ready", data }))
      .catch((error: unknown) => {
        if (cancelled) return;
        const status = error instanceof ApiError ? error.status : 0;
        if (status === 401) setReport({ status: "signin" });
        else if (status === 404) setReport({ status: "empty" });
        else setReport({ status: "error", message: error instanceof Error ? error.message : String(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [owner, repo, selected, pullsLoading, active]);

  if (!auth.ready) {
    return <div className="grid min-h-dvh place-items-center bg-bg text-sm text-fg-3">Loading…</div>;
  }
  if (!auth.signedIn) {
    return <LoginScreen subtitle={`Sign in to view ${owner}/${repo}.`} />;
  }

  return (
    <DashboardView
      user={auth.session?.user}
      onSignOut={auth.signOut}
      owner={owner}
      repo={repo}
      pulls={pulls}
      pullsLoading={pullsLoading}
      selected={selected}
    >
      <Main state={report} owner={owner} repo={repo} selected={selected} />
    </DashboardView>
  );
}

function Main({
  state,
  owner,
  repo,
  selected,
}: {
  state: ReportState;
  owner: string;
  repo: string;
  selected?: number;
}) {
  switch (state.status) {
    case "loading":
      return <CenterMessage>Loading report…</CenterMessage>;
    case "noPulls":
      return <CenterMessage>No open pull requests in this repository.</CenterMessage>;
    case "signin":
      return <CenterMessage>Your session expired. Refresh and sign in again.</CenterMessage>;
    case "empty":
      return (
        <CenterMessage>
          No Code Beat report for {owner}/{repo} #{selected} yet. It appears once the review action runs
          with report enabled.
        </CenterMessage>
      );
    case "error":
      return <CenterMessage>Could not load report: {state.message}</CenterMessage>;
    case "ready":
      return (
        <ReportPanel
          report={state.data.report}
          files={state.data.files}
          params={{ owner, repo, number: String(selected) }}
        />
      );
  }
}
