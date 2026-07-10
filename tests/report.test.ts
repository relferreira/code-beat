import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildFallbackOverview } from "../src/pr-overview.js";
import { buildChangeStats, buildReport, buildViewerUrl, reportPath } from "../src/report.js";
import { reportSchema } from "../src/report-schema.js";
import type { ValidatedReview } from "../src/review.js";

function makeOverview() {
  return {
    headline: "Adds an HTML report viewer for Code Beat reviews.",
    body: "## Purpose\n\nLets reviewers open a structured report with diffs and findings.\n\n## Approach\n\nPublishes report.json to an orphan branch and serves a SPA viewer.",
    majorDecisions: [
      "Store reports on an orphan branch so history stays out of main.",
      "Fetch diffs client-side so repo content never hits the viewer server."
    ],
    areas: ["report", "viewer", "action"],
    diagrams: [
      {
        title: "Report data flow",
        caption: "Action writes report; viewer reads it from the orphan branch.",
        mermaid: "flowchart LR\n  A[Action] --> B[report.json]\n  B --> C[Viewer]"
      }
    ]
  };
}

function makeReview(overrides: Partial<ValidatedReview> = {}): ValidatedReview {
  return {
    result: {
      score: 4,
      summary: "Solid change.",
      findings: [
        { path: "src/a.ts", line: 10, severity: "major", title: "Guard missing", body: "Add a guard." },
        { path: "src/b.ts", line: 3, severity: "minor", title: "Naming", body: "Rename this." }
      ]
    },
    comments: [{ path: "src/a.ts", line: 10, severity: "major", title: "Guard missing", body: "Add a guard." }],
    skippedCommentCount: 1,
    truncatedDiff: false,
    ...overrides
  };
}

function makeArgs(review: ValidatedReview) {
  return {
    toolName: "code-beat",
    toolVersion: "0.1.0",
    generatedAt: "2026-07-07T00:00:00.000Z",
    owner: "relferreira",
    repo: "code-beat",
    model: "deepseek/deepseek-v4-flash",
    pullRequest: {
      number: 123,
      title: "Add report viewer",
      author: "relferreira",
      baseRef: "main",
      headRef: "feature/report",
      baseSha: "aaaaaaa",
      headSha: "bbbbbbb"
    },
    overview: makeOverview(),
    changeStats: { filesChanged: 4, additions: 120, deletions: 30 },
    review
  };
}

describe("buildReport", () => {
  it("produces a schema-valid report with overview, diagrams, and stats", () => {
    const report = buildReport(makeArgs(makeReview()));

    assert.doesNotThrow(() => reportSchema.parse(report));
    assert.equal(report.schemaVersion, 3);
    assert.equal(report.pullRequest.headSha, "bbbbbbb");
    assert.equal(report.overview.headline, "Adds an HTML report viewer for Code Beat reviews.");
    assert.equal(report.overview.majorDecisions.length, 2);
    assert.equal(report.overview.diagrams.length, 1);
    assert.match(report.overview.diagrams[0]!.mermaid, /flowchart/);
    assert.deepEqual(report.changeStats, { filesChanged: 4, additions: 120, deletions: 30 });
    assert.equal(report.review.findings.length, 2);

    const posted = report.review.findings.find((f) => f.path === "src/a.ts");
    const skipped = report.review.findings.find((f) => f.path === "src/b.ts");
    assert.equal(posted?.posted, true);
    assert.equal(skipped?.posted, false);
  });

  it("carries score, model, and skipped count through", () => {
    const report = buildReport(makeArgs(makeReview({ skippedCommentCount: 3, truncatedDiff: true })));
    assert.equal(report.review.score, 4);
    assert.equal(report.review.model, "deepseek/deepseek-v4-flash");
    assert.equal(report.review.skippedCommentCount, 3);
    assert.equal(report.review.truncatedDiff, true);
  });

  it("defaults generatedAt to an ISO timestamp when omitted", () => {
    const args = makeArgs(makeReview());
    const report = buildReport({ ...args, generatedAt: undefined });
    assert.match(report.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("buildChangeStats", () => {
  it("sums additions and deletions across files", () => {
    assert.deepEqual(
      buildChangeStats([
        { additions: 10, deletions: 2 },
        { additions: 5, deletions: 1 }
      ]),
      { filesChanged: 2, additions: 15, deletions: 3 }
    );
  });
});

describe("buildFallbackOverview", () => {
  it("builds a usable overview with a fallback diagram from title, body, and files", () => {
    const overview = buildFallbackOverview({
      title: "Add discount helper",
      body: "Small helper for pricing experiments.",
      files: [
        { filename: "src/discount.ts", status: "added", additions: 8, deletions: 0, changes: 8 },
        { filename: "src/pricing.ts", status: "modified", additions: 2, deletions: 1, changes: 3 }
      ]
    });

    assert.equal(overview.headline, "Add discount helper");
    assert.match(overview.body, /Small helper for pricing experiments/);
    assert.match(overview.body, /src\/discount\.ts/);
    assert.ok(overview.diagrams.length >= 1);
    assert.match(overview.diagrams[0]!.mermaid, /flowchart/);
  });

  it("handles empty body and empty file list", () => {
    const overview = buildFallbackOverview({ title: "Tidy up", body: "", files: [] });
    assert.equal(overview.headline, "Tidy up");
    assert.match(overview.body, /No PR description/);
    assert.deepEqual(overview.diagrams, []);
  });
});

describe("buildViewerUrl", () => {
  it("builds a PR URL and trims trailing slashes", () => {
    assert.equal(
      buildViewerUrl("https://code-beat.dev/", "relferreira", "code-beat", 123),
      "https://code-beat.dev/relferreira/code-beat/pull/123"
    );
  });

  it("returns undefined for an empty base URL", () => {
    assert.equal(buildViewerUrl("   ", "relferreira", "code-beat", 123), undefined);
  });
});

describe("reportPath", () => {
  it("is per-PR", () => {
    assert.equal(reportPath(123), "reports/pr-123/report.json");
  });
});
