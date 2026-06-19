import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatInlineComment, formatReviewBody } from "../src/format.js";

describe("formatReviewBody", () => {
  it("formats a clean review with personality and no inline-comment count", () => {
    const body = formatReviewBody({
      result: {
        score: 5,
        summary: "No issues found.",
        findings: []
      },
      postedComments: [],
      skippedCommentCount: 0,
      truncatedDiff: false
    });

    assert.match(body, /## 🥁 Code Beat review/);
    assert.match(body, /\*\*Score:\*\* 🟢 \*\*5\/5\*\* - Ship-shape/);
    assert.match(body, /✨ \*\*No inline comments from me\.\*\*/);
    assert.doesNotMatch(body, /Inline comments posted/);
  });

  it("formats a rough review with comment and skipped counts", () => {
    const body = formatReviewBody({
      result: {
        score: 1,
        summary: "There are blocking concerns.",
        findings: []
      },
      postedComments: [
        {
          path: "src/example.ts",
          line: 12,
          severity: "major",
          title: "Missing guard",
          body: "This needs a guard."
        }
      ],
      skippedCommentCount: 2,
      truncatedDiff: true
    });

    assert.match(body, /## 🚨 Code Beat review/);
    assert.match(body, /🎯 \*\*Inline comments posted:\*\* 1/);
    assert.match(body, /🧹 \*\*Skipped inline comments:\*\* 2 finding\(s\)/);
    assert.match(body, /📎 \*\*Note:\*\*/);
  });
});

describe("formatInlineComment", () => {
  it("adds a severity icon", () => {
    assert.equal(
      formatInlineComment({
        path: "src/example.ts",
        line: 12,
        severity: "blocker",
        title: "Crash risk",
        body: "This can crash."
      }),
      "**🚨 blocker: Crash risk**\n\nThis can crash."
    );
  });
});
