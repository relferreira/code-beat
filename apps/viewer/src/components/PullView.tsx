import { useEffect, useState } from "react";
import { CenterMessage } from "./CenterMessage";
import { PullFiles } from "./PullFiles";
import { ReportPanel } from "../report/ReportPanel";
import { ApiError, fetchPullView, type PullViewData } from "../report/api";
import { usePulls } from "../lib/data";
import { SCORE_DOT, scoreTone } from "../lib/format";
import type { PullDetail, Report } from "../report/types";

type Tab = "pr" | "report";

type State =
  | { status: "loading" }
  | { status: "notFound" }
  | { status: "signin" }
  | { status: "noPulls" }
  | { status: "error"; message: string }
  | { status: "ready"; data: PullViewData };

/** The PR viewer: GitHub-style pull request tab + Code Beat report tab. */
export function PullView({ owner, repo, number }: { owner: string; repo: string; number?: number }) {
  const { pulls, loading: pullsLoading } = usePulls(owner, repo);
  const selected = number ?? pulls[0]?.number;
  const [state, setState] = useState<State>({ status: "loading" });
  // null = follow the default (report when it exists), otherwise the user's explicit choice.
  const [tab, setTab] = useState<Tab | null>(null);

  useEffect(() => {
    setTab(null);
  }, [owner, repo, selected]);

  useEffect(() => {
    if (selected == null) {
      setState(pullsLoading ? { status: "loading" } : { status: "noPulls" });
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });
    fetchPullView(owner, repo, selected)
      .then((data) => !cancelled && setState({ status: "ready", data }))
      .catch((error: unknown) => {
        if (cancelled) return;
        const status = error instanceof ApiError ? error.status : 0;
        if (status === 401) setState({ status: "signin" });
        else if (status === 404) setState({ status: "notFound" });
        else setState({ status: "error", message: error instanceof Error ? error.message : String(error) });
      });

    return () => {
      cancelled = true;
    };
  }, [owner, repo, selected, pullsLoading]);

  if (state.status === "loading") return <CenterMessage>Loading pull request…</CenterMessage>;
  if (state.status === "noPulls") return <CenterMessage>No open pull requests in this repository.</CenterMessage>;
  if (state.status === "signin") return <CenterMessage>Your session expired. Refresh and sign in again.</CenterMessage>;
  if (state.status === "notFound") {
    return (
      <CenterMessage>
        Couldn&apos;t find {owner}/{repo} #{selected}.
      </CenterMessage>
    );
  }
  if (state.status === "error") return <CenterMessage>Could not load pull request: {state.message}</CenterMessage>;

  const { pull, files, report } = state.data;
  const activeTab: Tab = tab ?? (report ? "report" : "pr");

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <PullHeader owner={owner} repo={repo} pull={pull} />
      <Tabs active={activeTab} onChange={setTab} report={report} />

      <div className="mt-6">
        {activeTab === "report" ? (
          report ? (
            <ReportPanel report={report} files={files} />
          ) : (
            <div className="rounded-xl border border-border bg-surface px-4 py-10 text-center text-sm text-fg-3">
              No Code Beat report for this pull request yet. It appears once the review action runs with report
              enabled.
            </div>
          )
        ) : (
          <PullFiles pull={pull} files={files} />
        )}
      </div>
    </div>
  );
}

function PullHeader({ owner, repo, pull }: { owner: string; repo: string; pull: PullDetail }) {
  return (
    <header>
      <div className="font-mono text-xs text-fg-3">
        {owner}/{repo} · #{pull.number}
      </div>
      <div className="mt-1.5 flex items-start justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight text-fg">{pull.title}</h1>
        <a
          href={pull.htmlUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-1 shrink-0 text-xs text-fg-3 transition hover:text-fg"
        >
          View on GitHub ↗
        </a>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-3">
        <StateBadge pull={pull} />
        <span className="text-fg-2">{pull.author}</span>
        <span>·</span>
        <span className="font-mono">
          {pull.baseRef} ← {pull.headRef}
        </span>
        <span>·</span>
        <span>
          <span className="text-good">+{pull.additions}</span> <span className="text-sev-blocker">&minus;{pull.deletions}</span>
        </span>
        <span>·</span>
        <span>
          {pull.changedFiles} {pull.changedFiles === 1 ? "file" : "files"}
        </span>
        <span>·</span>
        <span>
          {pull.commits} {pull.commits === 1 ? "commit" : "commits"}
        </span>
      </div>
    </header>
  );
}

function StateBadge({ pull }: { pull: PullDetail }) {
  const { label, className } = pull.merged
    ? { label: "Merged", className: "bg-sev-minor/15 text-sev-minor" }
    : pull.state === "closed"
      ? { label: "Closed", className: "bg-sev-blocker/12 text-sev-blocker" }
      : pull.draft
        ? { label: "Draft", className: "bg-surface-3 text-fg-3" }
        : { label: "Open", className: "bg-good/12 text-good" };

  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}>{label}</span>
  );
}

function Tabs({
  active,
  onChange,
  report,
}: {
  active: Tab;
  onChange: (tab: Tab) => void;
  report: Report | null;
}) {
  const tone = report ? scoreTone(report.review.score) : null;

  return (
    <div className="mt-6 flex gap-1 border-b border-border">
      <TabButton active={active === "pr"} onClick={() => onChange("pr")}>
        Pull request
      </TabButton>
      <TabButton active={active === "report"} onClick={() => onChange("report")}>
        Report
        {tone ? (
          <span className="ml-1.5 inline-flex items-center gap-1 text-xs text-fg-3">
            <span className={`size-1.5 rounded-full ${SCORE_DOT[tone.key]}`} />
            {report!.review.score}/5
          </span>
        ) : null}
      </TabButton>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px flex items-center border-b-2 px-3 py-2 text-sm transition ${
        active ? "border-brand font-medium text-fg" : "border-transparent text-fg-2 hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}
