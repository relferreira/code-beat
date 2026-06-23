import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseModelListValue } from "../src/model-list.js";

describe("parseModelListValue", () => {
  it("parses newline-separated models", () => {
    assert.deepEqual(
      parseModelListValue(`
deepseek/deepseek-v4-flash
moonshotai/kimi-k2.6
`),
      ["deepseek/deepseek-v4-flash", "moonshotai/kimi-k2.6"]
    );
  });

  it("parses comma-separated models", () => {
    assert.deepEqual(parseModelListValue("deepseek/deepseek-v4-flash, moonshotai/kimi-k2.6"), [
      "deepseek/deepseek-v4-flash",
      "moonshotai/kimi-k2.6"
    ]);
  });

  it("parses JSON-array models", () => {
    assert.deepEqual(parseModelListValue('["deepseek/deepseek-v4-flash","moonshotai/kimi-k2.6"]'), [
      "deepseek/deepseek-v4-flash",
      "moonshotai/kimi-k2.6"
    ]);
  });

  it("parses YAML-style list entries", () => {
    assert.deepEqual(
      parseModelListValue(`
- deepseek/deepseek-v4-flash
- moonshotai/kimi-k2.6
`),
      ["deepseek/deepseek-v4-flash", "moonshotai/kimi-k2.6"]
    );
  });
});
