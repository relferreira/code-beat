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

## Notes

- **SPA mode** (`tanstackStart({ spa: { enabled: true } })`) keeps route components
  client-only, so repo data is fetched in the browser and never server-rendered.
- The `@pierre/diffs` renderer is lazy-loaded (`DiffPane`) and gated to the client, so
  Shiki never runs during the prerendered shell build.
- `routeTree.gen.ts` and `worker-configuration.d.ts` are generated (gitignored).
