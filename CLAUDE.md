# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

homegame.today is a static MLB baseball schedule site that answers "Is there a home game today?" for all 30 teams. Built with Astro SSG, it fetches from the MLB Stats API at build time and deploys to Cloudflare Workers (via Workers Static Assets). Each team lives on its own subdomain (e.g. `cubs.homegame.today`). A unified Cloudflare Worker serves the static site, handles subdomain routing, and manages ActivityPub/AT Proto federation.

## Commands

```bash
pnpm install          # Install dependencies (pnpm 10+, Node 22+)
pnpm dev              # Local dev server (runs OG image generation via predev hook)
pnpm build            # Production build (Astro + OG images to dist/)
pnpm preview          # Preview production build
pnpm lint             # ESLint check
pnpm lint:fix         # ESLint autofix
pnpm format           # Prettier format
pnpm format:check     # Prettier check
pnpm cf:dev           # Local Cloudflare Worker dev
pnpm cf:deploy        # Deploy Cloudflare Worker
pnpm post:bluesky     # Post to Bluesky (requires BLUESKY_PASSWORD_<SLUG> env vars)
```

## Architecture

### Data Flow

All 30 teams are defined in `src/data/teams.json` (ID, slug, colors, venue, timezone, AT Proto DID). At build time, `getStaticPaths()` iterates teams and calls `buildTeamPageData()` which fetches schedule data from the MLB Stats API. The same data drives:

- **SSG pages** (`src/pages/[team].astro`) — team schedule pages
- **JSON API** (`src/pages/api/team/[slug].json.ts`) — static JSON endpoints
- **OG images** (`scripts/generate-og-daily.mjs`) — SVG-rendered daily images via Resvg
- **Bluesky posts** (`scripts/post-bluesky.mjs`) — daily social posts per team

### Core Logic (`src/lib/mlb.mjs`)

Central module containing all MLB schedule logic:
- `dateKeyInZone()` — dates computed in each team's local timezone, not UTC
- `fetchScheduleWindow()` — fetches regular season + postseason, dedupes by `gamePk`
- `fetchScheduleWindowCached()` — per-run in-memory HTTP cache
- `deriveTeamScheduleFacts()` — extracts home/away games, next home game
- `isStartTimeTbd()` — detects placeholder time `03:33Z` used for TBD games
- `formatTeamStatus()` — produces the Yes/No answer with context
- `buildTeamPageData()` — aggregates all page data for a team

### Cloudflare Worker (`cf/worker.mjs`)

Unified worker serving the entire site via Workers Static Assets (`env.ASSETS`):
- **Subdomain routing**: `cubs.homegame.today/` → rewrites to `/cubs/` and serves from static assets
- **Apex redirects**: `homegame.today/cubs` → 301 redirect to `cubs.homegame.today`
- **Federation**: WebFinger/host-meta on apex → redirects to Bridgy Fed for ActivityPub
- **AT Proto**: `/.well-known/atproto-did` on subdomains → returns team's AT Proto DID
- **Static assets**: all other requests pass through to `env.ASSETS`

### Key Patterns

- **Timezone-aware everything**: "today" is evaluated per team's timezone; OG filenames include date key (`cubs-2025-02-16.png`)
- **Schedule merging**: regular season + postseason queried in parallel, deduped by `gamePk`, prefers entries with concrete `gameDate`
- **Home game detection**: matches on team ID for regular season, falls back to venue name for postseason placeholders
- **WCAG 2.1 contrast** (`src/lib/color.mjs`): team colors are checked for accessibility before use

### Deployment

- **Cloudflare Workers**: single `wrangler deploy` deploys the worker + static assets to the `homegame.today` zone
- **GitHub Actions**: build + deploy in one job (`deploy.yml`); skips deploy on PRs
- **Scheduled**: daily Bluesky posts at 09:00 UTC during baseball season (Mar–Oct)

## Style

- ESLint flat config (`eslint.config.mjs`) with astro and typescript-eslint plugins
- Prettier with 100-char width, double quotes, ES5 trailing commas
- Source files use `.mjs` for plain JS modules, `.ts` for typed endpoints
- No unit tests; CI validates lint + successful build
