# Code Beat Report Viewer — Architecture

Status: **proposed / in progress**
Owner: @relferreira

This document describes the optional HTML report + diff viewer that complements the
Code Beat review action. The review action is the product; everything here is
**opt-in** and adds no dependency to the core review path when disabled.

## Goals & constraints

These four requirements are load-bearing. Every design decision below traces back to one of them.

1. **Data never leaves the user's repo — including summaries.** Review summaries and
   findings are written into the user's own repository. Diffs are fetched
   browser ↔ GitHub. No Code Beat server ever stores or proxies repo content.
2. **A better PR review experience** than reading a wall of inline comments — a real
   diff view with findings anchored to lines.
3. **Open source.** If a server is needed it must be small and self-hostable, not a
   data-custody SaaS.
4. **Works on private repos and stays private/secure.** Access is gated by GitHub's
   own permission model; secrets are handled by a real auth library, not hand-rolled.

## The one hard rule

> **Repo content (diffs, file bodies) is fetched client-side, browser ↔ GitHub, and
> never passes through a Code Beat server. The server holds auth tokens, never repo data.**

Everything else follows from this. In particular the viewer is a **client-rendered SPA**:
we deliberately do *not* server-render report/diff data, because SSR would route repo
content through our Worker and violate requirement 1.

## Components

```
┌──────────────────────┐        writes report.json          ┌────────────────────────┐
│  Code Beat Action     │ ─────────────────────────────────▶ │  User repo              │
│  (repo root)          │   to branch `code-beat-reports`     │  branch: code-beat-     │
│                       │                                     │  reports/reports/       │
│  • runs the review    │   posts PR comment with viewer URL  │    pr-<n>/report.json   │
└──────────────────────┘                                     └────────────────────────┘
                                                                          ▲
                                                                          │ contents API (CORS-ok)
                                                                          │ + pulls/compare API
                                                                          │ (repo data, client-side)
┌──────────────────────────────────────────────┐                         │
│  Viewer — TanStack Start (SPA mode) on         │─────────────────────────┘
│  Cloudflare Workers                            │
│                                                │   short-lived, in-memory GitHub token
│  • client-rendered UI (@pierre/diffs)          │◀──────────────┐
│  • server routes ONLY for auth:                │               │
│      /api/auth/*  (Better Auth)                │        ┌──────┴──────────┐
│      /api/github-token  (mint 8h token)        │        │  D1             │
└────────────────────────────────────────────────┘        │  sessions +     │
                                                           │  encrypted      │
                                                           │  refresh tokens │
                                                           │  (NO repo data) │
                                                           └─────────────────┘
```

- **Action** (`src/`, repo root): unchanged review pipeline plus an optional report
  writer. Has **zero** Cloudflare dependency. When `report` is off, behavior is
  byte-for-byte identical to today.
- **Report schema** (`src/report-schema.ts`): the typed contract for `report.json`.
  Source of truth lives with the action; the viewer consumes a copy/published version.
  Keeping it typed (not freeform HTML) keeps the model honest and lets the viewer
  evolve independently.
- **Viewer** (`apps/viewer/`, added later): TanStack Start in **SPA mode** deployed to a
  Worker. Client-rendered so repo data is fetched in the browser. Its server routes exist
  *only* for auth. Renders the report + a `@pierre/diffs` (diffs.com) diff pane.
- **D1**: sessions + Better Auth's encrypted GitHub refresh tokens. **Never** repo
  content. "Cache the report in D1 for speed" is explicitly out of bounds — that is the
  line where we become custodians of repo data.

> Note on layout: the action currently lives at the repo root (GitHub resolves
> `action.yml` + `dist/` there). There are no external consumers yet, so it is safe to
> move it under `packages/action/` when the viewer lands and a shared
> `packages/report-schema` becomes worthwhile. Until then the report schema lives in
> `src/report-schema.ts` as the source of truth.

## Data flow

### Write (in CI, when `report: true`)

1. Review completes; the action already has `score`, `summary`, `findings[]`, and PR
   metadata (numbers, refs, base/head SHA).
2. Action builds a `report.json` validated against `report-schema`.
3. Action commits it to `code-beat-reports` at `reports/pr-<n>/report.json`
   (per-PR-latest; overwrite each run). The branch is an **orphan** branch so report
   history stays out of code history.
4. Action appends one link line to the PR review comment: `📊 View report → <viewer-url>/<owner>/<repo>/pull/<n>`.

### Read (reviewer clicks the link)

1. Viewer SPA loads (static assets from the Worker).
2. If no session: "Sign in with GitHub" → Better Auth GitHub-App OAuth → session cookie
   (httpOnly). Refresh token stored encrypted in D1.
3. Viewer calls `GET /api/github-token` (authenticated by session cookie). Server mints a
   short-lived (~8h) user-to-server token from the stored refresh token and returns it.
   The browser keeps it **in memory only**.
4. Browser fetches, **directly from GitHub**: `report.json` (contents API) and the diff
   (`pulls/<n>/files` or `compare/<base>...<head>`, keyed by the SHAs in the report).
5. Viewer renders report + diff with findings anchored to `path:line`.

Repo content touches: the user's browser and GitHub. Never our server.

## Auth & security

- **GitHub App** (not classic OAuth App): read-only **Contents** + **Pull requests**
  permissions only, installed once per org by an admin. Minimal blast radius is the main
  selling point to security teams.
- **Better Auth** owns sessions + token refresh. httpOnly cookie session so XSS cannot
  lift a long-lived token. The long-lived refresh token lives encrypted in D1; the
  browser only ever holds a short-lived access token, in memory.
- **Strict CSP** on the viewer, no third-party scripts (bundle `@pierre/diffs`, don't
  CDN it), minimal dependencies.
- **Self-hostable**: the whole Worker is one `wrangler deploy` with a D1 binding + a few
  secrets. Orgs that won't trust the default instance run their own; the action's
  `viewer-url` input points at it.

### Honest trade-off

The viewer Worker is a real trust boundary: it stores users' **encrypted GitHub tokens**
(never repo data). "Data never leaves the repo" stays literally true for repo *content
and summaries*; we are custodians of *auth tokens only*. This is the unavoidable price of
"click the link from the PR comment, in a cold browser, and it just works." Minimal
permissions + self-hostability are the mitigations.

## `report.json` schema (v3)

The report is a **visual bird's-eye view of the PR** (what it does, major decisions,
diagrams, change stats). Diffs live on the **PR tab**, not the report tab.

We deliberately do **not** use freeform MDX from the model: arbitrary JSX is a security
and reliability risk. Instead the model fills a **typed JSON contract**; the viewer maps
fields onto React components (metrics, Mermaid, charts, decision cards).

```jsonc
{
  "schemaVersion": 3,
  "generatedAt": "2026-07-07T12:00:00.000Z",
  "tool": { "name": "code-beat", "version": "0.1.0" },
  "repo": { "owner": "relferreira", "name": "code-beat" },
  "pullRequest": {
    "number": 123,
    "title": "Add report viewer",
    "author": "relferreira",
    "baseRef": "main",
    "headRef": "feature/report",
    "baseSha": "abc…",
    "headSha": "def…"
  },
  "overview": {
    "headline": "One-line description of what this PR does",
    "body": "Markdown bird's-eye narrative: purpose, approach, scope…",
    "majorDecisions": [
      "Store reports on an orphan branch…",
      "Fetch diffs client-side…"
    ],
    "areas": ["report", "viewer", "action"],
    "diagrams": [
      {
        "title": "Report data flow",
        "caption": "Optional short caption",
        "mermaid": "flowchart LR\n  A[Action] --> B[report.json]\n  B --> C[Viewer]"
      }
    ]
  },
  "changeStats": {
    "filesChanged": 12,
    "additions": 400,
    "deletions": 80
  },
  "review": {
    "score": 4,
    "summary": "…",
    "model": "deepseek/deepseek-v4-flash",
    "truncatedDiff": false,
    "skippedCommentCount": 0,
    "findings": [
      {
        "path": "src/example.ts",
        "line": 12,
        "severity": "major",
        "title": "Missing guard",
        "body": "…",
        "posted": true
      }
    ]
  }
}
```

When `report: true`, the action runs a dedicated overview model call (same OpenRouter
key/model as the review) after the review completes. If that call fails, a deterministic
fallback is built from the PR title, body, and file list so publish still succeeds.

## PR write actions (viewer)

The viewer can act as a full GitHub PR client (not just read reports). Mutations use the
**signed-in user's** GitHub token on the Worker (same privacy model as reads: tokens on
server, no repo content stored).

| Capability | API | UI |
| --- | --- | --- |
| Conversation comment | `POST …/issues/{n}/comments` | Conversation tab composer |
| Review (approve / request changes / comment) | `POST …/pulls/{n}/reviews` | Review panel (Conversation + Files) |
| Inline review comments (batched with review) | review `comments[]` | Files → “Add review comment” drafts |
| Merge / squash / rebase | `PUT …/pulls/{n}/merge` | Merge box on Conversation |

**GitHub App permissions required for write:** Pull requests **Read and write**, Contents
**Read and write** (merge). View-only still works with read scopes.

Not yet: click-to-comment on diff lines, labels/assignees/reviewers, close/reopen, update
branch, checks tab, reactions, edit title/body. Those can land as follow-ups on the same
mutation pattern (`/api/pr/...` + Worker proxy).

## Action inputs (opt-in)

| input           | default              | meaning                                                        |
| --------------- | -------------------- | -------------------------------------------------------------- |
| `report`        | `false`              | generate + publish the report and add the viewer link          |
| `report-branch` | `code-beat-reports`  | orphan branch the report is committed to                       |
| `viewer-url`    | `https://code-beat.dev` | base URL of the viewer; override to self-host              |

When `report` is `false`, none of the report code runs and no new permissions are needed.
When `true`, the action needs `contents: write` to push the report branch (the quick-start
already requests it).

## Implementation notes (verified against official docs)

These are pinned to the current docs/examples (checked 2026-07) so the scaffold follows
best practice rather than memory.

### TanStack Start SPA on Cloudflare Workers

- **Plugin order matters**: `cloudflare({ viteEnvironment: { name: "ssr" } })` must come
  **before** `tanstackStart()` in `vite.config.ts`, then `viteReact()`.
- **SPA mode**: `tanstackStart({ spa: { enabled: true } })`. Route components render
  client-side; only the **shell** is prerendered. The root route must define a
  `shellComponent` (`createRootRoute({ shellComponent: RootDocument })`) rendering
  `<html><head><HeadContent/></head><body>{children}<Scripts/></body></html>`. This is
  what keeps repo data off the server — loaders/components run in the browser.
- **Worker entry**: `wrangler.jsonc` → `"main": "@tanstack/react-start/server-entry"`,
  `compatibility_flags: ["nodejs_compat"]`. The Vite plugin auto-generates client/server
  entries and `routeTree.gen.ts` (gitignored). You hand-write only `router.tsx`
  (a `getRouter()` factory) and `routes/`.

### Better Auth on Workers + D1

- **Per-request auth instance**: D1 bindings only exist inside the request context, so the
  auth instance must be built per-request via a `createAuth(env)` factory — **not** at
  module top-level. This shapes how the auth server routes are written.
- **D1 via built-in Kysely**: use Better Auth's built-in Kysely path with a D1 dialect;
  no Drizzle adapter needed for our token-only schema.
- **Migrations**: the `@better-auth/cli` can't reach Cloudflare bindings. Run migrations
  programmatically with `getMigrations(auth.options).runMigrations()` (Kysely adapter
  only) behind a one-time admin endpoint/script, or generate SQL locally and apply with
  `wrangler d1 migrations`.

### GitHub App token nuance (decision recorded)

Better Auth's `github` social provider is written for **OAuth-App** semantics: tokens do
not expire and no refresh token is issued. GitHub **Apps** can issue expiring (8h) tokens
+ 6-month refresh tokens *only if* "expire user authorization tokens" is enabled — and the
built-in provider may not auto-refresh App-style tokens.

**v1 decision:** ship a **GitHub App** for least privilege (read-only Contents + Pull
requests, per-org install, `user:email` scope + Email read permission) with token
expiration **off**, so the built-in provider works cleanly. Store the token in D1; release
it to the browser **in memory** via `/api/github-token`. **Hardening (later):** turn on
expiry and wire refresh (likely via Better Auth's generic OAuth plugin). Until then the
"8h in-memory token" story is weaker — an XSS could exfiltrate a longer-lived token — so
strict CSP + minimal deps carry more weight in v1.

### Diff rendering

`@pierre/diffs/react` `PatchDiff` takes a unified `patch` string — exactly what GitHub's
`pulls/{n}/files` returns per file — plus `lineAnnotations` to anchor findings to lines,
and `options` for split/stacked layout + Shiki theme (auto light/dark). Bundle it (no CDN)
to keep the CSP strict.

## Build order

1. **(this repo, now)** `report-schema` + action report writer + inputs + tests. Testable
   without any Cloudflare. Keeps the action fully working.
2. `apps/viewer` scaffold: TanStack Start SPA on Workers, static render of a `report.json`
   fixture with `@pierre/diffs`, no auth yet.
3. Better Auth + D1 + GitHub App; `/api/github-token`; wire the client GitHub fetches.
4. Custom domain, the nice URL, docs.

Deferred (not now): the `npx code-beat view` localhost-bridge CLI (was the zero-server
fallback tier; can be added later if locked-down orgs ask).
