import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collectRepoInstructions, readRepoFile } from "../src/repo-tools.js";

describe("repo tools", () => {
  it("prevents reading outside the checkout", () => {
    const root = mkdtempSync(join(tmpdir(), "code-beat-"));

    try {
      const result = readRepoFile(root, "../secret.txt");
      assert.deepEqual(result, { error: "Path is outside the repository checkout." });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("collects common repository instruction files", () => {
    const root = mkdtempSync(join(tmpdir(), "code-beat-"));

    try {
      mkdirSync(join(root, ".github"), { recursive: true });
      writeFileSync(join(root, "AGENTS.md"), "Use local conventions.");
      writeFileSync(join(root, ".github", "copilot-instructions.md"), "Prefer small modules.");

      const instructions = collectRepoInstructions(root);
      assert.match(instructions, /AGENTS\.md/);
      assert.match(instructions, /Use local conventions/);
      assert.match(instructions, /copilot-instructions\.md/);
      assert.match(instructions, /Prefer small modules/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
