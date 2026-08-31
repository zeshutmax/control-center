# Control Center

A personal control center for every project I run: a registry merged from GitHub
repos and DigitalOcean apps, first-party analytics via a tiny pixel, and an MCP
server so Claude Code (and other agents) can read the whole portfolio and
propose collaborations between projects.

**Phase 1 is read-only** — it observes GitHub and DigitalOcean, never writes to them.

## Stack

Next.js (App Router) · Postgres (Drizzle ORM) · [mcp-handler](https://github.com/vercel/mcp-handler) · Tailwind 4

## Local development

```bash
pnpm install
createdb control_center_dev
cp .env.example .env      # fill in DATABASE_URL (and tokens when ready)
pnpm db:push              # create tables
pnpm seed                 # optional: demo projects + synthetic traffic
pnpm dev
```

Without `GITHUB_TOKEN`/`DO_API_TOKEN` the registry only shows seeded data;
with them, hit **Sync now** in the UI (or `POST /api/sync`) to pull the real
portfolio.

## The pieces

### Registry sync (read-only)

`POST /api/sync` pulls:

- **GitHub** — all repos you own: description, topics, default branch, last push,
  plus each repo's `project.yaml` manifest (see below).
- **DigitalOcean** — all App Platform apps and static sites, matched to repos via
  the GitHub source declared in each app spec, plus deployment history.

Unmatched items are surfaced instead of dropped: an app with no repo shows a
**NO REPO** badge; a repo with no app shows **NOT DEPLOYED**. Projects deleted
upstream are removed from the registry on the next sync (their pixel events are
kept and re-attach by slug if the project comes back); a second app deployed
from the same repo (e.g. staging) gets its own row.

### project.yaml — the manifest

Any repo can declare a manifest at its root. All fields optional:

```yaml
name: Meal Planner
description: Weekly meal planning web app
url: https://meals.example.com
stack: [nextjs, postgres]
tags: [food, saas]
exposes:
  - kind: api
    description: "JSON API: weekly plans, shopping lists"
    url: https://meals.example.com/api
needs:
  - Recipe data source with nutrition facts
  - User auth that could be shared across my apps
notes: Free-form context for agents reading the registry.
```

`exposes` and `needs` are what make collaboration proposals possible — an agent
reading the registry can match one project's needs against another's exposes.

### Analytics pixel

```html
<script defer src="https://YOUR-CONTROL-CENTER/px.js" data-site="project-slug"></script>
```

- ~1 KB, no cookies, no fingerprinting beyond a **daily-rotating** salted hash of
  IP + user agent (uniques reset every UTC day; rotate `PIXEL_SECRET` to reset all).
- Tracks SPA navigations (pushState/replaceState/popstate). Query strings are
  stripped; referrers are reduced to hostnames.
- Skips localhost unless `data-dev` is present; obvious bots are dropped server-side.
- Ingestion is capped (4 KB bodies, 120 events/min/IP) and stored text is
  sanitized; events for site ids that never match a project are pruned after 30 days.
- Every project's detail page shows its copy-paste snippet.

### MCP server

Streamable HTTP endpoint at `/api/mcp`. Connect Claude Code:

```bash
claude mcp add --transport http control-center https://YOUR-CONTROL-CENTER/api/mcp --header "Authorization: Bearer $CONTROL_CENTER_TOKEN"
```

Tools: `list_projects`, `get_project`, `get_project_stats`, `get_recent_activity`,
`get_collaboration_context`, `get_pixel_snippet`.

Try: *"Look at my control center — what happened this week, and which of my
projects could work together?"*

### Auth

One secret, `CONTROL_CENTER_TOKEN`, guards everything private:

- **Dashboard pages** — HTTP Basic auth via `src/proxy.ts` (any username,
  password = the token). The registry contains private-repo names and manifests,
  so the whole UI is behind it.
- **`/api/mcp` and `/api/sync`** — `Authorization: Bearer <token>`.
- **`/api/collect` and `/px.js`** — intentionally public; sites post pageviews there.

Unset the token locally for convenience; in production everything above
**refuses to serve** without it.

## Deploying to DigitalOcean

1. Create an App Platform app from this repo (Next.js buildpack, `pnpm build` / `pnpm start`).
2. Attach a managed Postgres and set `DATABASE_URL` (keep `sslmode=require`).
3. Set env vars: `GITHUB_TOKEN`, `GITHUB_OWNER`, `DO_API_TOKEN`, `PIXEL_SECRET`,
   `CONTROL_CENTER_TOKEN`, `CONTROL_CENTER_URL` (the app's public URL).
4. Run `pnpm drizzle-kit push` against the managed DB once (console or job).
5. Schedule `POST /api/sync` (with the bearer token) hourly — cron, DO scheduled
   function, or a GitHub Action.

## Roadmap (phase 2+)

- Write actions: redeploy/rollback buttons, env var editing (DO API write scope)
- Cross-repo PRs (add the pixel everywhere, bump shared deps)
- Uptime checks + SSL/domain expiry monitoring
- DO billing / cost per project
- Screenshot thumbnails per site
