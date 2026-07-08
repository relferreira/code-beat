import { Suspense, lazy, useEffect, useState } from "react";
import { SCORE_DOT, SCORE_PILL, SEVERITY, scoreTone } from "../lib/format";
import { useTheme } from "../lib/theme";
import type { Report, ReportFinding, ViewerFile } from "./types";

const DiffPane = lazy(() => import("./DiffPane"));

export function ReportPanel({
  report,
  files,
  params,
}: {
  report: Report;
  files: ViewerFile[];
  params: { owner: string; repo: string; number: string };
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { theme } = useTheme();

  const tone = scoreTone(report.review.score);
  const findingsByPath = groupBy(report.review.findings, (f) => f.path);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="font-mono text-xs text-fg-3">
        {params.owner}/{params.repo} · #{params.number}
      </div>
      <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-fg">{report.pullRequest.title}</h1>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-semibold ${SCORE_PILL[tone.key]}`}>
          <span className={`size-1.5 rounded-full ${SCORE_DOT[tone.key]}`} />
          {report.review.score}/5
        </span>
        <span className="text-sm text-fg-2">{tone.label}</span>
        <span className="font-mono text-xs text-fg-3">{report.review.model}</span>
      </div>

      <p className="mt-4 rounded-xl border border-border bg-surface p-4 text-sm leading-relaxed text-fg-2">
        {report.review.summary}
      </p>

      <div className="mt-8 space-y-6">
        {files.map((file) => (
          <section key={file.path} className="overflow-hidden rounded-xl border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <span className="truncate font-mono text-xs text-fg">{file.path}</span>
              <span className="shrink-0 pl-3 text-xs text-fg-3">{file.status}</span>
            </div>

            {findingsByPath.get(file.path)?.length ? (
              <ul className="divide-y divide-border border-b border-border">
                {findingsByPath.get(file.path)!.map((finding, i) => (
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
        ))}
      </div>

      <div className="mt-8 text-xs text-fg-3">
        Generated {new Date(report.generatedAt).toLocaleString()} · {report.tool.name} {report.tool.version}
      </div>
    </div>
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

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = map.get(k);
    if (bucket) bucket.push(item);
    else map.set(k, [item]);
  }
  return map;
}
