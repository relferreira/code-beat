import type { ReactNode } from "react";
import { AppHeader, type HeaderUser } from "./AppHeader";
import { Sidebar } from "./Sidebar";
import type { PullSummary } from "../report/types";

/** Presentational dashboard shell: header + PR sidebar + main content. */
export function DashboardView({
  user,
  onSignOut,
  owner,
  repo,
  pulls,
  pullsLoading,
  selected,
  children,
}: {
  user?: HeaderUser | null;
  onSignOut?: () => void;
  owner: string;
  repo: string;
  pulls: PullSummary[];
  pullsLoading: boolean;
  selected?: number;
  children: ReactNode;
}) {
  return (
    <div className="flex h-dvh flex-col">
      <AppHeader user={user} onSignOut={onSignOut} />
      <div className="flex min-h-0 flex-1">
        <Sidebar owner={owner} repo={repo} pulls={pulls} loading={pullsLoading} selected={selected} />
        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

export function CenterMessage({ children }: { children: ReactNode }) {
  return (
    <div className="grid h-full place-items-center p-8">
      <p className="max-w-sm text-center text-sm text-fg-3">{children}</p>
    </div>
  );
}
