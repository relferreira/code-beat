import { Link } from "@tanstack/react-router";
import { relativeTime } from "../lib/format";
import type { PullSummary } from "../report/types";

export function Sidebar({
  owner,
  repo,
  pulls,
  loading,
  selected,
}: {
  owner: string;
  repo: string;
  pulls: PullSummary[];
  loading: boolean;
  selected?: number;
}) {
  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-bg">
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <span className="truncate font-mono text-xs text-fg-3">
          {owner}/{repo}
        </span>
      </div>
      <div className="flex items-center justify-between px-4 pb-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-fg-3">Open pull requests</span>
        {!loading ? (
          <span className="rounded-full bg-surface-2 px-1.5 text-[11px] tabular-nums text-fg-3">{pulls.length}</span>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {loading ? (
          <div className="space-y-1 px-1">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-surface-2" />
            ))}
          </div>
        ) : pulls.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-fg-3">No open pull requests.</div>
        ) : (
          pulls.map((pr) => {
            const active = pr.number === selected;
            return (
              <Link
                key={pr.number}
                to="/$owner/$repo/pull/$number"
                params={{ owner, repo, number: String(pr.number) }}
                className={`block rounded-lg px-2.5 py-2 transition ${
                  active ? "bg-surface-2" : "hover:bg-surface-2/60"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[11px] tabular-nums text-fg-3">#{pr.number}</span>
                  {pr.draft ? (
                    <span className="rounded bg-surface-3 px-1 text-[10px] font-medium uppercase tracking-wide text-fg-3">
                      draft
                    </span>
                  ) : null}
                </div>
                <div className={`mt-0.5 line-clamp-2 text-[13px] leading-snug ${active ? "text-fg" : "text-fg-2"}`}>
                  {pr.title}
                </div>
                <div className="mt-1 truncate text-[11px] text-fg-3">
                  {pr.author} · {relativeTime(pr.updatedAt)}
                </div>
              </Link>
            );
          })
        )}
      </div>
    </aside>
  );
}
