import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getInput } from "../src/action-core.js";

describe("getInput", () => {
  it("reads GitHub's hyphenated input environment variable names", () => {
    process.env["INPUT_OPENROUTER-API-KEY"] = "secret-value";

    try {
      assert.equal(getInput("openrouter-api-key"), "secret-value");
    } finally {
      delete process.env["INPUT_OPENROUTER-API-KEY"];
    }
  });
});
