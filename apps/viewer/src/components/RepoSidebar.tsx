import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useRepos, usePulls } from "../lib/data";
import { LockIcon } from "./icons";
import type { PullSummary, RepoSummary } from "../report/types";

export interface ActiveTarget {
  owner: string;
  repo: string;
  number?: number;
}

export function RepoSidebar({ active }: { active?: ActiveTarget }) {
  const { repos, loading } = useRepos();
  const { pulls, loading: pullsLoading } = usePulls(active?.owner, active?.repo);
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle ? repos.filter((r) => r.fullName.toLowerCase().includes(needle)) : repos;
    return groupByOwner(filtered);
  }, [repos, query]);

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-bg">
      <div className="space-y-2 p-3">
        <Link
          to="/"
          className={`block rounded-lg px-2.5 py-1.5 text-[13px] transition ${
            active ? "text-fg-2 hover:bg-surface-2/60" : "bg-surface-2 text-fg"
          }`}
        >
          Feed
        </Link>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter repositories"
          aria-label="Filter repositories"
          className="h-8 w-full rounded-md border border-border bg-surface px-2.5 text-[13px] text-fg placeholder:text-fg-3 focus:border-fg-3 focus:outline-none"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {loading ? (
          <div className="space-y-1 px-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-7 animate-pulse rounded-md bg-surface-2" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-fg-3">
            {repos.length === 0 ? "No repositories. Install Code Beat on a repo or org." : "No matches."}
          </div>
        ) : (
          groups.map(([owner, list]) => (
            <div key={owner} className="mb-3">
              <div className="px-2.5 pb-1 text-[11px] font-medium uppercase tracking-wider text-fg-3">{owner}</div>
              {list.map((repo) => {
                const isActive = active?.owner === repo.owner && active?.repo === repo.name;
                return (
                  <div key={repo.fullName}>
                    <Link
                      to="/$owner/$repo"
                      params={{ owner: repo.owner, repo: repo.name }}
                      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] transition ${
                        isActive ? "bg-surface-2 text-fg" : "text-fg-2 hover:bg-surface-2/60"
                      }`}
                    >
                      <span className="truncate">{repo.name}</span>
                      {repo.private ? <span className="shrink-0 text-fg-3"><LockIcon /></span> : null}
                    </Link>
                    {isActive ? (
                      <PullList
                        owner={repo.owner}
                        repo={repo.name}
                        pulls={pulls}
                        loading={pullsLoading}
                        selected={active?.number}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

function PullList({
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
  if (loading) {
    return <div className="my-1 ml-4 border-l border-border py-1 pl-3 text-[11px] text-fg-3">Loading…</div>;
  }
  if (pulls.length === 0) {
    return <div className="my-1 ml-4 border-l border-border py-1 pl-3 text-[11px] text-fg-3">No open PRs</div>;
  }
  return (
    <div className="my-0.5 ml-4 border-l border-border pl-1.5">
      {pulls.map((pr) => (
        <Link
          key={pr.number}
          to="/$owner/$repo/pull/$number"
          params={{ owner, repo, number: String(pr.number) }}
          className={`flex items-baseline gap-1.5 rounded-md px-2 py-1 text-[12px] transition ${
            pr.number === selected ? "bg-surface-2 text-fg" : "text-fg-2 hover:bg-surface-2/60"
          }`}
        >
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-fg-3">#{pr.number}</span>
          <span className="truncate">{pr.title}</span>
        </Link>
      ))}
    </div>
  );
}

function groupByOwner(repos: RepoSummary[]): Array<[string, RepoSummary[]]> {
  const map = new Map<string, RepoSummary[]>();
  for (const repo of repos) {
    const bucket = map.get(repo.owner);
    if (bucket) bucket.push(repo);
    else map.set(repo.owner, [repo]);
  }
  return [...map.entries()];
}
