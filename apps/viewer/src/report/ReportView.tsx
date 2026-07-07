import { Suspense, lazy, useEffect, useState } from "react";
import type { Report, ReportFinding, Severity, ViewerFile } from "./types";

const DiffPane = lazy(() => import("./DiffPane"));

const SEVERITY_META: Record<Severity, { label: string; icon: string }> = {
  blocker: { label: "Blocker", icon: "🚨" },
  major: { label: "Major", icon: "⚠️" },
  minor: { label: "Minor", icon: "💡" },
};

function scoreTone(score: number): { badge: string; label: string } {
  if (score >= 5) return { badge: "🟢", label: "Ship-shape" };
  if (score >= 4) return { badge: "🟢", label: "Solid rhythm" };
  if (score >= 3) return { badge: "🟡", label: "Mostly in tune" };
  if (score >= 2) return { badge: "🟠", label: "Needs another pass" };
  return { badge: "🔴", label: "Please do not merge yet" };
}

export function ReportView({
  report,
  files,
  params,
}: {
  report: Report;
  files: ViewerFile[];
  params: { owner: string; repo: string; number: string };
}) {
  // Gate the diff renderer to the client so @pierre/diffs never loads on the server.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const tone = scoreTone(report.review.score);
  const findingsByPath = groupBy(report.review.findings, (f) => f.path);

  return (
    <main className="container">
      <header className="masthead">
        <div className="crumbs">
          {params.owner}/{params.repo} · PR #{params.number}
        </div>
        <h1>{report.pullRequest.title}</h1>
        <div className="score">
          <span className="score-badge">{tone.badge}</span>
          <strong>{report.review.score}/5</strong>
          <span className="score-label">{tone.label}</span>
          <span className="model">· {report.review.model}</span>
        </div>
        <p className="summary">{report.review.summary}</p>
      </header>

      <section className="files">
        {files.map((file) => (
          <article key={file.path} className="file">
            <div className="file-head">
              <span className="file-path">{file.path}</span>
              <span className="file-status">{file.status}</span>
            </div>

            {findingsByPath.get(file.path)?.length ? (
              <ul className="findings">
                {findingsByPath.get(file.path)!.map((finding, index) => (
                  <FindingItem key={index} finding={finding} />
                ))}
              </ul>
            ) : null}

            <div className="diff">
              {!file.patch ? (
                <div className="no-diff">No diff available for this file.</div>
              ) : mounted ? (
                <Suspense fallback={<pre className="raw-patch">{file.patch}</pre>}>
                  <DiffPane patch={file.patch} />
                </Suspense>
              ) : (
                <pre className="raw-patch">{file.patch}</pre>
              )}
            </div>
          </article>
        ))}
      </section>

      <footer className="footer">
        Report generated {new Date(report.generatedAt).toLocaleString()} by{" "}
        {report.tool.name} {report.tool.version}
      </footer>
    </main>
  );
}

function FindingItem({ finding }: { finding: ReportFinding }) {
  const meta = SEVERITY_META[finding.severity];
  return (
    <li className={`finding finding-${finding.severity}`}>
      <div className="finding-head">
        <span className="finding-icon">{meta.icon}</span>
        <span className="finding-title">{finding.title}</span>
        <span className="finding-line">
          {finding.path}:{finding.line}
        </span>
        {!finding.posted ? <span className="finding-skipped">not posted inline</span> : null}
      </div>
      <p className="finding-body">{finding.body}</p>
    </li>
  );
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = map.get(k);
    if (bucket) {
      bucket.push(item);
    } else {
      map.set(k, [item]);
    }
  }
  return map;
}
