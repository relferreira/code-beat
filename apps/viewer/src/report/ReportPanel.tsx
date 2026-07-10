import type { ReactNode } from "react";
import { Markdown } from "../components/Markdown";
import { SCORE_PILL, SEVERITY, scoreTone } from "../lib/format";
import { MermaidDiagram } from "./MermaidDiagram";
import type { ChangeStats, Report, ReportFinding, Severity } from "./types";

/** Report tab: visual bird's-eye PR overview — no diffs (those live on the PR tab). */
export function ReportPanel({ report }: { report: Report }) {
  const tone = scoreTone(report.review.score);
  const overview = report.overview;
  const stats = report.changeStats;
  const severityCounts = countBySeverity(report.review.findings);

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-fg-3">Pull request report</p>
            <h2 className="mt-1.5 text-lg font-semibold tracking-tight text-fg sm:text-xl">
              {overview?.headline ?? report.pullRequest.title}
            </h2>
            {overview && overview.areas.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {overview.areas.map((area) => (
                  <span
                    key={area}
                    className="rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-xs text-fg-2"
                  >
                    {area}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <div
            className={`flex shrink-0 flex-col items-center rounded-2xl px-5 py-3 ${SCORE_PILL[tone.key]}`}
          >
            <span className="text-[10px] font-semibold uppercase tracking-wide opacity-80">Score</span>
            <span className="text-3xl font-bold tabular-nums leading-none">{report.review.score}</span>
            <span className="mt-0.5 text-xs opacity-90">/5 · {tone.label}</span>
          </div>
        </div>

        <StatsStrip
          stats={stats}
          findings={report.review.findings.length}
          severityCounts={severityCounts}
        />
      </section>

      {/* Charts row */}
      <section className="grid gap-4 sm:grid-cols-2">
        <ChartCard title="Diff size">
          <DiffSizeChart stats={stats} />
        </ChartCard>
        <ChartCard title="Findings by severity">
          <SeverityChart counts={severityCounts} />
        </ChartCard>
      </section>

      {/* Diagrams */}
      {overview?.diagrams && overview.diagrams.length > 0 ? (
        <section className="space-y-4">
          <SectionLabel>Architecture & flow</SectionLabel>
          {overview.diagrams.map((diagram) => (
            <div key={diagram.title} className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
              <h3 className="text-sm font-semibold text-fg">{diagram.title}</h3>
              {diagram.caption ? <p className="mt-1 text-xs text-fg-3">{diagram.caption}</p> : null}
              <div className="mt-3">
                <MermaidDiagram source={diagram.mermaid} title={diagram.title} />
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {/* Narrative */}
      {overview?.body ? (
        <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <SectionLabel>Overview</SectionLabel>
          <Markdown className="mt-3 text-sm text-fg-2">{overview.body}</Markdown>
        </section>
      ) : null}

      {/* Major decisions */}
      {overview && overview.majorDecisions.length > 0 ? (
        <section>
          <SectionLabel>Major decisions</SectionLabel>
          <ol className="mt-3 grid gap-3 sm:grid-cols-2">
            {overview.majorDecisions.map((decision, index) => (
              <li
                key={decision}
                className="flex gap-3 rounded-2xl border border-border bg-surface p-4 text-sm text-fg-2"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand/12 text-xs font-bold text-brand">
                  {index + 1}
                </span>
                <span className="leading-relaxed">{decision}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {/* Review findings (list, not diffs) */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionLabel>Review findings</SectionLabel>
          <span className="font-mono text-xs text-fg-3">{report.review.model}</span>
        </div>
        <Markdown className="mt-3 rounded-2xl border border-border bg-surface p-4 text-sm text-fg-2">
          {report.review.summary}
        </Markdown>

        {report.review.findings.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-fg-3">
            No findings — open the PR tab for the full diff.
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {report.review.findings.map((finding) => (
              <FindingCard key={`${finding.path}:${finding.line}:${finding.title}`} finding={finding} />
            ))}
          </ul>
        )}
      </section>

      <div className="text-xs text-fg-3">
        Generated {new Date(report.generatedAt).toLocaleString()} · {report.tool.name} {report.tool.version}
        {report.schemaVersion ? ` · schema v${report.schemaVersion}` : ""}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-3">{children}</h2>;
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-3">{title}</h3>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function StatsStrip({
  stats,
  findings,
  severityCounts,
}: {
  stats?: ChangeStats;
  findings: number;
  severityCounts: Record<Severity, number>;
}) {
  const items = [
    { label: "Files", value: stats?.filesChanged ?? "—", tone: "text-fg" },
    { label: "Added", value: stats ? `+${stats.additions}` : "—", tone: "text-good" },
    { label: "Removed", value: stats ? `−${stats.deletions}` : "—", tone: "text-sev-blocker" },
    { label: "Findings", value: findings, tone: "text-fg" },
    {
      label: "Blockers",
      value: severityCounts.blocker,
      tone: severityCounts.blocker > 0 ? "text-sev-blocker" : "text-fg-3",
    },
  ];

  return (
    <dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl border border-border bg-surface-2 px-3 py-2.5">
          <dt className="text-[10px] font-medium uppercase tracking-wide text-fg-3">{item.label}</dt>
          <dd className={`mt-0.5 text-lg font-semibold tabular-nums ${item.tone}`}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Horizontal stacked bar for additions vs deletions. */
function DiffSizeChart({ stats }: { stats?: ChangeStats }) {
  if (!stats || (stats.additions === 0 && stats.deletions === 0)) {
    return <p className="text-sm text-fg-3">No change stats in this report.</p>;
  }

  const total = stats.additions + stats.deletions;
  const addPct = Math.round((stats.additions / total) * 100);
  const delPct = 100 - addPct;

  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-surface-3">
        <div className="bg-good transition-all" style={{ width: `${addPct}%` }} title={`+${stats.additions}`} />
        <div className="bg-sev-blocker transition-all" style={{ width: `${delPct}%` }} title={`−${stats.deletions}`} />
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-fg-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-good" />
          +{stats.additions} lines ({addPct}%)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-sev-blocker" />
          −{stats.deletions} lines ({delPct}%)
        </span>
        <span className="text-fg-3">{stats.filesChanged} file{stats.filesChanged === 1 ? "" : "s"}</span>
      </div>
    </div>
  );
}

/** Simple bar chart for severity breakdown. */
function SeverityChart({ counts }: { counts: Record<Severity, number> }) {
  const total = counts.blocker + counts.major + counts.minor;
  if (total === 0) {
    return (
      <div className="flex h-24 items-center justify-center text-sm text-fg-3">No findings</div>
    );
  }

  const max = Math.max(counts.blocker, counts.major, counts.minor, 1);
  const rows: Array<{ key: Severity; count: number; bar: string }> = [
    { key: "blocker", count: counts.blocker, bar: "bg-sev-blocker" },
    { key: "major", count: counts.major, bar: "bg-sev-major" },
    { key: "minor", count: counts.minor, bar: "bg-sev-minor" },
  ];

  return (
    <div className="space-y-2.5">
      {rows.map((row) => (
        <div key={row.key} className="flex items-center gap-3">
          <span className="w-14 shrink-0 text-xs capitalize text-fg-2">{row.key}</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-3">
            <div
              className={`h-full rounded-full ${row.bar}`}
              style={{ width: `${Math.max(row.count > 0 ? 8 : 0, (row.count / max) * 100)}%` }}
            />
          </div>
          <span className="w-6 text-right font-mono text-xs tabular-nums text-fg">{row.count}</span>
        </div>
      ))}
    </div>
  );
}

function FindingCard({ finding }: { finding: ReportFinding }) {
  const sev = SEVERITY[finding.severity];
  return (
    <li className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`size-2 rounded-full ${sev.dot}`} />
        <span className="text-xs font-medium text-fg-2">{sev.label}</span>
        {!finding.posted ? (
          <span className="rounded-full bg-surface-3 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-fg-3">
            not posted
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 text-sm font-medium text-fg">{finding.title}</p>
      <p className="mt-1 font-mono text-xs text-fg-3">
        {finding.path}:{finding.line}
      </p>
      <Markdown className="mt-2 text-sm text-fg-2">{finding.body}</Markdown>
    </li>
  );
}

function countBySeverity(findings: ReportFinding[]): Record<Severity, number> {
  return {
    blocker: findings.filter((f) => f.severity === "blocker").length,
    major: findings.filter((f) => f.severity === "major").length,
    minor: findings.filter((f) => f.severity === "minor").length,
  };
}
