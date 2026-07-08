import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getPulls, runWithConcurrency, useRepos } from "../lib/data";
import { relativeTime } from "../lib/format";
import type { FeedItem } from "../report/types";

// Only scan the most recently pushed repos — a feed doesn't need the long tail.
const SCAN_REPOS = 20;
const CONCURRENCY = 5;

export function Feed() {
  const { repos, loading } = useRepos();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (loading) return;
    const targets = repos.slice(0, SCAN_REPOS);
    if (targets.length === 0) {
      setItems([]);
      return;
    }

    let cancelled = false;
    setItems([]);
    setScanning(true);

    runWithConcurrency(
      targets,
      CONCURRENCY,
      (repo) => getPulls(repo.owner, repo.name),
      (pulls, repo) => {
        if (cancelled || pulls.length === 0) return;
        const next = pulls.map((pull) => ({ owner: repo.owner, repo: repo.name, pull }));
        // Merge progressively so the feed fills in as repos respond.
        setItems((prev) =>
          [...prev, ...next].sort((a, b) => Date.parse(b.pull.updatedAt) - Date.parse(a.pull.updatedAt)),
        );
      },
    ).finally(() => {
      if (!cancelled) setScanning(false);
    });

    return () => {
      cancelled = true;
    };
  }, [repos, loading]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold tracking-tight text-fg">Recent pull requests</h1>
        {scanning ? <span className="text-xs text-fg-3">Scanning repositories…</span> : null}
      </div>
      <p className="mt-1 text-sm text-fg-2">
        Open pull requests across your {repos.length > SCAN_REPOS ? `${SCAN_REPOS} most active ` : ""}repositories.
      </p>

      <div className="mt-6 space-y-2">
        {loading ? (
          [0, 1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-surface-2" />)
        ) : items.length === 0 && !scanning ? (
          <div className="rounded-xl border border-border bg-surface px-4 py-10 text-center text-sm text-fg-3">
            {repos.length === 0
              ? "No repositories yet. Install Code Beat on a repository or organization."
              : "No open pull requests across your repositories."}
          </div>
        ) : (
          items.map((item) => <FeedRow key={`${item.owner}/${item.repo}#${item.pull.number}`} item={item} />)
        )}
      </div>
    </div>
  );
}

function FeedRow({ item }: { item: FeedItem }) {
  const { owner, repo, pull } = item;
  return (
    <Link
      to="/$owner/$repo/pull/$number"
      params={{ owner, repo, number: String(pull.number) }}
      className="block rounded-xl border border-border bg-surface px-4 py-3 transition hover:border-fg-3/40"
    >
      <div className="flex items-center gap-1.5 text-[11px] text-fg-3">
        <span className="truncate font-mono">
          {owner}/{repo}
        </span>
        <span>·</span>
        <span className="font-mono tabular-nums">#{pull.number}</span>
        {pull.draft ? (
          <span className="rounded bg-surface-3 px-1 text-[10px] font-medium uppercase tracking-wide">draft</span>
        ) : null}
      </div>
      <div className="mt-1 text-sm font-medium text-fg">{pull.title}</div>
      <div className="mt-1 text-xs text-fg-3">
        {pull.author} · {relativeTime(pull.updatedAt)}
      </div>
    </Link>
  );
}
