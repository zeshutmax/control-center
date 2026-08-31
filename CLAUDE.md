# Control Center — agent notes

Personal portfolio control center: GitHub+DigitalOcean registry, first-party
analytics pixel, MCP server. **Phase 1 is strictly read-only against GitHub and
DigitalOcean** — do not add write calls to their APIs without being asked.

## Commands

- `pnpm dev` — dev server (localhost:3000, local Postgres `control_center_dev`)
- `pnpm db:push` — apply schema changes (drizzle-kit, reads `.env`)
- `pnpm seed` — reset+reseed `demo-*` projects and synthetic traffic
- `pnpm build` / `npx tsc --noEmit` — verify changes

## Map

- `src/db/schema.ts` — all tables + the `ProjectManifest` type (project.yaml shape)
- `src/lib/sync.ts` — the merge: repos + DO apps → `projects` rows; orphan handling
- `src/lib/github.ts` / `src/lib/digitalocean.ts` — thin REST clients, no SDKs
- `src/lib/stats.ts` — SQL aggregates for the pixel data (raw `db.execute`)
- `src/app/api/collect/route.ts` — pixel ingestion; must stay a "simple" CORS
  request (text/plain body, no preflight) — don't add required headers
- `src/app/api/mcp/route.ts` — MCP tools (mcp-handler v2 + `@modelcontextprotocol/server`;
  NOT the old `@modelcontextprotocol/sdk`)
- `public/px.js` — the pixel; keep it dependency-free and ~1 KB
- `src/lib/auth.ts` — bearer guard for /api/mcp + /api/sync; fails closed in production
- `src/proxy.ts` — Basic-auth guard for all pages (Next 16 proxy, née middleware);
  its matcher must keep excluding /api/collect and /px.js
- `src/app/actions.ts` — server action the Sync button uses (works in prod
  because the page itself is auth-gated; the browser never needs the token)

## Conventions

- Slugs are the join key everywhere: pixel `data-site`, MCP tool args, URLs.
- Chart colors `#31a65f` (views) / `#3e8fd6` (visitors) are CVD-validated for the
  dark surface — don't change casually; UI accent `#86e7a0` is not a data color.
- Dates in Postgres are timestamptz; daily bucketing is UTC.
- `.env` holds local config (gitignored); `.env.example` documents every var.
