import { useEffect, useState } from "react";
import { CenterMessage } from "./CenterMessage";
import { ReportPanel } from "../report/ReportPanel";
import { ApiError, fetchReport, type LoadedReport } from "../report/api";
import { usePulls } from "../lib/data";

type ReportState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "signin" }
  | { status: "noPulls" }
  | { status: "error"; message: string }
  | { status: "ready"; data: LoadedReport };

/** Loads and renders one PR's report. With no `number`, falls back to the latest open PR. */
export function ReportContainer({ owner, repo, number }: { owner: string; repo: string; number?: number }) {
  const { pulls, loading: pullsLoading } = usePulls(owner, repo);
  const selected = number ?? pulls[0]?.number;
  const [state, setState] = useState<ReportState>({ status: "loading" });

  useEffect(() => {
    if (selected == null) {
      setState(pullsLoading ? { status: "loading" } : { status: "noPulls" });
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });
    fetchReport(owner, repo, selected)
      .then((data) => !cancelled && setState({ status: "ready", data }))
      .catch((error: unknown) => {
        if (cancelled) return;
        const status = error instanceof ApiError ? error.status : 0;
        if (status === 401) setState({ status: "signin" });
        else if (status === 404) setState({ status: "empty" });
        else setState({ status: "error", message: error instanceof Error ? error.message : String(error) });
      });

    return () => {
      cancelled = true;
    };
  }, [owner, repo, selected, pullsLoading]);

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
          No Code Beat report for {owner}/{repo} #{selected} yet. It appears once the review action runs with
          report enabled.
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
