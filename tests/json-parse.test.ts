import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseJsonObject } from "../src/review.js";

describe("parseJsonObject", () => {
  it("parses plain JSON", () => {
    assert.deepEqual(parseJsonObject('{"summary":"ok","findings":[]}'), {
      summary: "ok",
      findings: []
    });
  });

  it("parses fenced JSON", () => {
    assert.deepEqual(parseJsonObject('```json\n{"summary":"ok","findings":[]}\n```'), {
      summary: "ok",
      findings: []
    });
  });

  it("parses JSON embedded in explanatory text", () => {
    assert.deepEqual(parseJsonObject('Here is the result:\n{"score":4,"summary":"ok","findings":[]}'), {
      score: 4,
      summary: "ok",
      findings: []
    });
  });
});
