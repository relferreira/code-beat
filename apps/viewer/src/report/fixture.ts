import type { Report, ViewerFile } from "./types";

export const demoReport: Report = {
  schemaVersion: 1,
  generatedAt: "2026-07-07T12:00:00.000Z",
  tool: { name: "code-beat", version: "0.1.0" },
  repo: { owner: "relferreira", name: "code-beat" },
  pullRequest: {
    number: 42,
    title: "Add retry with backoff to the OpenRouter client",
    author: "relferreira",
    baseRef: "main",
    headRef: "feature/retry-backoff",
    baseSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    headSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  },
  review: {
    score: 3,
    summary:
      "The retry loop is a solid addition, but the backoff can overflow on high attempt counts and the sleep is not cancellable. Tests cover the happy path only.",
    model: "deepseek/deepseek-v4-flash",
    truncatedDiff: false,
    skippedCommentCount: 1,
    findings: [
      {
        path: "src/client.ts",
        line: 14,
        severity: "major",
        title: "Backoff can overflow to Infinity",
        body: "`delay * 2 ** attempt` grows without bound; cap it with a `maxDelayMs` before sleeping.",
        posted: true,
      },
      {
        path: "src/client.ts",
        line: 19,
        severity: "minor",
        title: "Sleep is not cancellable",
        body: "Awaiting a bare `setTimeout` means an aborted request still waits out the full delay. Thread an AbortSignal through.",
        posted: true,
      },
      {
        path: "src/client.test.ts",
        line: 8,
        severity: "minor",
        title: "Only the happy path is tested",
        body: "Add a case that exhausts all attempts and asserts the final rejection.",
        posted: false,
      },
    ],
  },
};

export const demoFiles: ViewerFile[] = [
  {
    path: "src/client.ts",
    status: "modified",
    patch: `diff --git a/src/client.ts b/src/client.ts
--- a/src/client.ts
+++ b/src/client.ts
@@ -1,10 +1,21 @@
 export async function call(model: string, prompt: string) {
-  const res = await fetch(endpoint, { method: "POST", body: prompt });
-  if (!res.ok) throw new Error("request failed");
-  return res.json();
+  let attempt = 0;
+  while (true) {
+    const res = await fetch(endpoint, { method: "POST", body: prompt });
+    if (res.ok) return res.json();
+    if (attempt >= maxAttempts) throw new Error("request failed");
+    const delay = baseDelay * 2 ** attempt;
+    await new Promise((resolve) => setTimeout(resolve, delay));
+    attempt += 1;
+  }
 }
`,
  },
  {
    path: "src/client.test.ts",
    status: "modified",
    patch: `diff --git a/src/client.test.ts b/src/client.test.ts
--- a/src/client.test.ts
+++ b/src/client.test.ts
@@ -5,3 +5,9 @@ describe("call", () => {
   it("returns the parsed body on success", async () => {
     const body = await call("m", "p");
     assert.deepEqual(body, { ok: true });
   });
+
+  it("retries on failure", async () => {
+    const body = await call("m", "p");
+    assert.deepEqual(body, { ok: true });
+  });
 });
`,
  },
];
