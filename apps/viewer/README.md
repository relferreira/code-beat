# Code Beat — Report Viewer

Client-rendered viewer for Code Beat review reports. Built with **TanStack Start (SPA
mode)** on **Cloudflare Workers**, rendering diffs with **[@pierre/diffs](https://diffs.com)**.

See [`../../docs/report-viewer-architecture.md`](../../docs/report-viewer-architecture.md)
for the full design and the privacy rule this app is built around:

> Repo content (diffs, file bodies) is fetched **client-side, browser ↔ GitHub**, and never
> passes through a Code Beat server. The server holds auth tokens, never repo data.

## Status

- ✅ App shell + report route + `@pierre/diffs` diff pane, rendering a demo fixture.
- ⬜ Client-side fetch of `report.json` (contents API) + diff (`pulls/files`).
- ⬜ Better Auth + D1 + GitHub App (`/api/github-token`).

## Develop

```bash
npm install
npm run dev        # vite dev on http://localhost:3000
```

Open `http://localhost:3000/relferreira/code-beat/pull/42` to see the demo report.

## Scripts

| script      | what it does                                   |
| ----------- | ---------------------------------------------- |
| `dev`       | Vite dev server                                |
| `build`     | Build client + server, prerender the shell     |
| `check`     | `tsc --noEmit`                                 |
| `preview`   | Preview the production build locally           |
| `deploy`    | Build + `wrangler deploy` to Cloudflare Workers |
| `cf-typegen`| Generate `worker-configuration.d.ts` bindings   |

## Deploy (Cloudflare Workers Builds — GitHub auto-deploy)

This app is a monorepo subdirectory, so the Worker is built from `apps/viewer`.

1. Commit and push `apps/viewer/` (including `package-lock.json` and `wrangler.jsonc`) to GitHub.
2. Cloudflare dashboard → **Workers & Pages → Create → Workers → Import a repository**.
   Authorize the Cloudflare GitHub App on the `code-beat` repo.
3. Build settings:
   - **Root directory:** `apps/viewer`
   - **Build command:** `npm run build`
   - **Deploy command:** `npx wrangler deploy`
   - **Build watch paths** (optional, monorepo): `apps/viewer/*`
4. Deploy. The Worker name comes from `wrangler.jsonc` (`code-beat-viewer`); every push to the
   production branch rebuilds and redeploys. Node is pinned via `.node-version`.

No secrets or bindings are needed for the current fixture app (D1 is commented out in
`wrangler.jsonc`). When auth lands, add the D1 binding and set `GITHUB_CLIENT_ID`,
`GITHUB_CLIENT_SECRET`, and `BETTER_AUTH_SECRET` as Worker secrets.

**Custom domain (the nice URL):** after the first deploy the Worker is on
`code-beat-viewer.<subdomain>.workers.dev`. To serve it at `code-beat.dev`, add a Custom
Domain under the Worker's **Settings → Domains & Routes** (the zone must be on Cloudflare),
then set the action's `viewer-url` input to that domain.

## Enabling auth (private repos)

The viewer works for **public** repos with no auth. Private repos (and escaping GitHub's
60 req/hr unauthenticated limit) need a GitHub App + D1. Repo content is still fetched
browser ↔ GitHub — the Worker only mints a short-lived token.

1. **Register a GitHub App** (Settings → Developer settings → GitHub Apps → New):
   - **Callback URL:** `<BETTER_AUTH_URL>/api/auth/callback/github`
     (e.g. `https://code-beat.relferreira.workers.dev/api/auth/callback/github`)
   - **Permissions (for full PR workflow):** Repository → *Contents* **Read and write**,
     *Pull requests* **Read and write**, *Metadata* Read; Account → *Email addresses*
     - Read-only still works for viewing; **write is required** to comment, review
       (approve / request changes), and merge/squash/rebase from the viewer.
   - Enable **Request user authorization (OAuth) during installation**.
   - Copy the **Client ID**, generate a **Client secret**, and **Install** the App on the
     repos/orgs you want to view. After raising permissions, re-accept the permission
     prompt on each installation.
2. **Create D1:** `wrangler d1 create code-beat-viewer` → put the `database_id` in the
   `d1_databases` block in `wrangler.jsonc` (already set for this repo's deployment).
3. **Set secrets** (`wrangler secret put <NAME>` or dashboard):
   `BETTER_AUTH_SECRET` (random), `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`,
   `MIGRATE_SECRET` (random). Confirm the `BETTER_AUTH_URL` var equals the deployed origin.
   (`keep_vars: true` in `wrangler.jsonc` stops deploys from wiping dashboard-set values.)
4. **Deploy** (push to `main`, or `npm run deploy`).
5. **Run migrations once** (header avoids URL-encoding the secret):
   `curl -H "x-migrate-secret: <MIGRATE_SECRET>" "<BETTER_AUTH_URL>/api/migrate"` → `{"ok":true}`.
6. Open a private repo's report URL → **Sign in with GitHub** → authorize → it renders.

Local dev: `cp .env.example .env` and fill it in, `npm run dev`, then
`curl -H "x-migrate-secret: <MIGRATE_SECRET>" http://localhost:3000/api/migrate`.
Local sign-in also needs `http://localhost:3000/api/auth/callback/github` added as a
callback URL on the GitHub App and `BETTER_AUTH_URL=http://localhost:3000` in `.env`.

If D1/secrets are absent (e.g. a fork), the auth routes return 401/503 and the viewer
stays public-only, so `main` keeps deploying green.

## Notes

- **SPA mode** (`tanstackStart({ spa: { enabled: true } })`) keeps route components
  client-only, so repo data is fetched in the browser and never server-rendered.
- The `@pierre/diffs` renderer is lazy-loaded (`DiffPane`) and gated to the client, so
  Shiki never runs during the prerendered shell build.
- `routeTree.gen.ts` and `worker-configuration.d.ts` are generated (gitignored).
