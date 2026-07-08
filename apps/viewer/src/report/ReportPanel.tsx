import { Markdown } from "../components/Markdown";
import { SCORE_DOT, SCORE_PILL, scoreTone } from "../lib/format";
import { FileCard, type FileSource } from "./FileCard";
import type { Report, ReportFinding, ViewerFile } from "./types";

/** Report tab: score, summary, and each file's diff annotated with findings. */
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

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
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
