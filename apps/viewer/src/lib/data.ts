import { useEffect, useState } from "react";
import { fetchOpenPulls, fetchRepos } from "../report/api";
import type { PullSummary, RepoSummary } from "../report/types";

// In-memory (browser) promise cache so navigating between repos/PRs doesn't refetch.
// Deliberately not persisted anywhere: repo data is never stored off GitHub.
const cache = new Map<string, Promise<unknown>>();

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key) as Promise<T> | undefined;
  if (hit) return hit;
  const pending = load().catch((error: unknown) => {
    cache.delete(key); // don't cache failures
    throw error;
  });
  cache.set(key, pending);
  return pending;
}

export function getPulls(owner: string, repo: string): Promise<PullSummary[]> {
  return cached(`pulls:${owner}/${repo}`, () => fetchOpenPulls(owner, repo));
}

export function useRepos(): { repos: RepoSummary[]; loading: boolean } {
  const [state, setState] = useState<{ repos: RepoSummary[]; loading: boolean }>({ repos: [], loading: true });

  useEffect(() => {
    let cancelled = false;
    cached("repos", fetchRepos)
      .then((repos) => !cancelled && setState({ repos, loading: false }))
      .catch(() => !cancelled && setState({ repos: [], loading: false }));
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

export function usePulls(owner?: string, repo?: string): { pulls: PullSummary[]; loading: boolean } {
  const [state, setState] = useState<{ pulls: PullSummary[]; loading: boolean }>({
    pulls: [],
    loading: Boolean(owner && repo),
  });

  useEffect(() => {
    if (!owner || !repo) {
      setState({ pulls: [], loading: false });
      return;
    }
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true }));
    getPulls(owner, repo)
      .then((pulls) => !cancelled && setState({ pulls, loading: false }))
      .catch(() => !cancelled && setState({ pulls: [], loading: false }));
    return () => {
      cancelled = true;
    };
  }, [owner, repo]);

  return state;
}

/**
 * Run `task` over items with bounded concurrency, invoking `onResult` as each finishes so the
 * caller can render progressively. Failures are skipped.
 *
 * The feed fans out one request per repo from the *browser* on purpose: each Worker invocation
 * then makes a single GitHub subrequest, so we never approach Cloudflare's per-request
 * subrequest limit (50 on the free plan).
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>,
  onResult: (result: R, item: T) => void,
): Promise<void> {
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const item = items[cursor++];
      try {
        onResult(await task(item), item);
      } catch {
        /* skip repos we can't read */
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
