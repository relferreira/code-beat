import { Markdown } from "../components/Markdown";
import { SCORE_DOT, SCORE_PILL, scoreTone } from "../lib/format";
import { FileCard, type FileSource } from "./FileCard";
import type { PrOverview, Report, ReportFinding, ViewerFile } from "./types";

/** Report tab: PR bird's-eye overview, then score / findings with annotated diffs. */
export function ReportPanel({
  report,
  files,
  source,
}: {
  report: Report;
  files: ViewerFile[];
  source: FileSource;
}) {
  const tone = scoreTone(report.review.score);
  const findingsByPath = groupBy(report.review.findings, (f) => f.path);
  const overview = report.overview;

  return (
    <div>
      {overview ? <OverviewSection overview={overview} /> : null}

      <section className={overview ? "mt-8" : undefined}>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-3">Review</h2>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-semibold ${SCORE_PILL[tone.key]}`}
          >
            <span className={`size-1.5 rounded-full ${SCORE_DOT[tone.key]}`} />
            {report.review.score}/5
          </span>
          <span className="text-sm text-fg-2">{tone.label}</span>
          <span className="font-mono text-xs text-fg-3">{report.review.model}</span>
        </div>

        <Markdown className="mt-4 rounded-xl border border-border bg-surface p-4 text-sm text-fg-2">
          {report.review.summary}
        </Markdown>
      </section>

      <div className="mt-6 space-y-6">
        {files.map((file) => (
          <FileCard key={file.path} file={file} findings={findingsByPath.get(file.path)} source={source} />
        ))}
      </div>

      <div className="mt-8 text-xs text-fg-3">
        Generated {new Date(report.generatedAt).toLocaleString()} · {report.tool.name} {report.tool.version}
      </div>
    </div>
  );
}

function OverviewSection({ overview }: { overview: PrOverview }) {
  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-3">Pull request overview</h2>
      <p className="mt-2 text-base font-medium text-fg-1">{overview.headline}</p>

      {overview.areas.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {overview.areas.map((area) => (
            <span
              key={area}
              className="rounded-full border border-border bg-surface px-2 py-0.5 text-xs text-fg-2"
            >
              {area}
            </span>
          ))}
        </div>
      ) : null}

      <Markdown className="mt-4 rounded-xl border border-border bg-surface p-4 text-sm text-fg-2">
        {overview.body}
      </Markdown>

      {overview.majorDecisions.length > 0 ? (
        <div className="mt-4 rounded-xl border border-border bg-surface p-4">
          <h3 className="text-sm font-semibold text-fg-1">Major decisions</h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-fg-2">
            {overview.majorDecisions.map((decision) => (
              <li key={decision}>{decision}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function groupBy(items: ReportFinding[], key: (item: ReportFinding) => string): Map<string, ReportFinding[]> {
  const map = new Map<string, ReportFinding[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = map.get(k);
    if (bucket) bucket.push(item);
    else map.set(k, [item]);
  }
  return map;
}
