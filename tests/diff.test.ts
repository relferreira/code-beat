import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDiffContext, parseAddedLines } from "../src/diff.js";

describe("parseAddedLines", () => {
  it("returns only added new-file line numbers", () => {
    const patch = [
      "@@ -1,4 +1,5 @@",
      " context",
      "-old",
      "+new",
      " unchanged",
      "+another"
    ].join("\n");

    assert.deepEqual([...parseAddedLines(patch)], [2, 4]);
  });

  it("handles multiple hunks", () => {
    const patch = [
      "@@ -1,2 +10,3 @@",
      "+first",
      " context",
      "@@ -20,2 +30,3 @@",
      " context",
      "+second"
    ].join("\n");

    assert.deepEqual([...parseAddedLines(patch)], [10, 31]);
  });
});

describe("buildDiffContext", () => {
  it("tracks commentable lines per file", () => {
    const context = buildDiffContext([
      {
        filename: "src/example.ts",
        status: "modified",
        additions: 1,
        deletions: 0,
        changes: 1,
        patch: "@@ -1 +1,2 @@\n line\n+added"
      }
    ]);

    assert.equal(context.commentableLines.get("src/example.ts")?.has(2), true);
  });
});
