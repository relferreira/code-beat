import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyReviewThreadFeedback, selectInlineComments } from "../src/review.js";

describe("selectInlineComments", () => {
  it("keeps only findings on added lines and respects the comment limit", () => {
    const commentableLines = new Map([["src/a.ts", new Set([2, 3])]]);
    const result = selectInlineComments(
      [
        { path: "src/a.ts", line: 2, severity: "major", title: "First", body: "Body" },
        { path: "src/a.ts", line: 4, severity: "major", title: "Skipped", body: "Body" },
        { path: "src/a.ts", line: 3, severity: "minor", title: "Second", body: "Body" }
      ],
      commentableLines,
      1
    );

    assert.equal(result.comments.length, 1);
    assert.equal(result.comments[0]?.title, "First");
    assert.equal(result.skippedCommentCount, 2);
  });
});

describe("applyReviewThreadFeedback", () => {
  it("suppresses findings from resolved Code Beat review threads", () => {
    const result = applyReviewThreadFeedback(
      {
        score: 2,
        summary: "Has concerns.",
        findings: [{ path: "src/a.ts", line: 2, severity: "major", title: "Missing guard", body: "Body" }]
      },
      [
        {
          isResolved: true,
          isOutdated: false,
          path: "src/a.ts",
          line: 2,
          comments: [
            {
              author: "github-actions",
              body: "**⚠️ major: Missing guard**\n\nBody",
              path: "src/a.ts",
              line: 2
            }
          ]
        }
      ]
    );

    assert.equal(result.score, 5);
    assert.deepEqual(result.findings, []);
  });

  it("suppresses findings when a human replied that the issue is not valid", () => {
    const result = applyReviewThreadFeedback(
      {
        score: 2,
        summary: "Has concerns.",
        findings: [{ path: "src/a.ts", line: 10, severity: "major", title: "Unexpected fallback", body: "Body" }]
      },
      [
        {
          isResolved: false,
          isOutdated: false,
          path: "src/a.ts",
          line: 10,
          comments: [
            {
              author: "github-actions",
              body: "**⚠️ major: Unexpected fallback**\n\nBody",
              path: "src/a.ts",
              line: 10
            },
            {
              author: "relferreira",
              body: "This is not valid because the fallback is intentional.",
              path: "src/a.ts",
              line: 10
            }
          ]
        }
      ]
    );

    assert.equal(result.score, 5);
    assert.deepEqual(result.findings, []);
  });

  it("keeps findings from unresolved threads without human disagreement", () => {
    const finding = { path: "src/a.ts", line: 2, severity: "major" as const, title: "Missing guard", body: "Body" };
    const result = applyReviewThreadFeedback(
      {
        score: 2,
        summary: "Has concerns.",
        findings: [finding]
      },
      [
        {
          isResolved: false,
          isOutdated: false,
          path: "src/a.ts",
          line: 2,
          comments: [
            {
              author: "github-actions",
              body: "**⚠️ major: Missing guard**\n\nBody",
              path: "src/a.ts",
              line: 2
            }
          ]
        }
      ]
    );

    assert.equal(result.score, 2);
    assert.deepEqual(result.findings, [finding]);
  });
});
