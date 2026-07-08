import { Suspense, lazy, useEffect, useState } from "react";
import { SEVERITY } from "../lib/format";
import { useTheme } from "../lib/theme";
import type { ReportFinding, ViewerFile } from "./types";

const DiffPane = lazy(() => import("./DiffPane"));

/** One changed file: header, optional Code Beat findings, and the diff. Shared by both tabs. */
export function FileCard({ file, findings }: { file: ViewerFile; findings?: ReportFinding[] }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { theme } = useTheme();

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="truncate font-mono text-xs text-fg">{file.path}</span>
        <span className="shrink-0 pl-3 text-xs text-fg-3">{file.status}</span>
      </div>

      {findings?.length ? (
        <ul className="divide-y divide-border border-b border-border">
          {findings.map((finding, i) => (
            <FindingItem key={i} finding={finding} />
          ))}
        </ul>
      ) : null}

      <div className="overflow-x-auto bg-bg">
        {!file.patch ? (
          <div className="px-4 py-3 text-sm text-fg-3">No diff available for this file.</div>
        ) : mounted ? (
          <Suspense fallback={<RawPatch patch={file.patch} />}>
            <DiffPane patch={file.patch} theme={theme} />
          </Suspense>
        ) : (
          <RawPatch patch={file.patch} />
        )}
      </div>
    </section>
  );
}

function FindingItem({ finding }: { finding: ReportFinding }) {
  const sev = SEVERITY[finding.severity];
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`size-2 rounded-full ${sev.dot}`} />
        <span className="text-sm font-medium text-fg">{finding.title}</span>
        <span className="font-mono text-xs text-fg-3">
          {finding.path}:{finding.line}
        </span>
        {!finding.posted ? (
          <span className="rounded-full border border-border px-1.5 text-[10px] font-medium uppercase tracking-wide text-fg-3">
            not posted
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-sm leading-relaxed text-fg-2">{finding.body}</p>
    </li>
  );
}

function RawPatch({ patch }: { patch: string }) {
  return <pre className="overflow-x-auto p-4 font-mono text-xs text-fg-2">{patch}</pre>;
}
