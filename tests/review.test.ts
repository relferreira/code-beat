import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectInlineComments } from "../src/review.js";

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
