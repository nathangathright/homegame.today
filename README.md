# homegame.today

[![Build](https://github.com/nathangathright/homegame.today/actions/workflows/build.yml/badge.svg)](https://github.com/nathangathright/homegame.today/actions/workflows/build.yml)
[![Lint](https://github.com/nathangathright/homegame.today/actions/workflows/lint.yml/badge.svg)](https://github.com/nathangathright/homegame.today/actions/workflows/lint.yml)

Find out if your MLB team has a home game today.

- Live site: `https://homegame.today`
- Tech: Astro 5, Tailwind CSS 4, TypeScript-enabled Astro components

## What this repo contains

- Static site (SSG) with per‑team pages
- Daily OG image generation (Resvg rendering)
- Optional daily Bluesky posting per team
- Shared MLB utility for fetching/formatting schedule data
- Small SEO utility for JSON‑LD

## Architecture at a glance

- `src/lib/mlb.mjs`
  - Fetch/date helpers: `computeWindowStartEnd`, `fetchScheduleWindowCached`, `dateKeyInZone`
  - Derivers/formatters: `deriveTeamScheduleFacts`, `formatTeamStatus`, `buildDetailContent`, `buildTeamPageMeta`
  - Page helpers: `selectGameForTeamToday`, `getOgImagePath`, `buildTeamPageData`
  - Bluesky helpers: `getBlueskyHandle`, `getBlueskyProfileUrl`, `getBlueskyRssUrl`
  - Config: `HORIZON_MONTHS = 9` (schedule window)
  - TBD time handling: `isStartTimeTbd`, `getLocalDateAndOptionalTime`
- `src/lib/seo.mjs`
  - `buildSportsEventJsonLd` for `SportsEvent` schema
- `src/pages/[team].astro`
  - Thin page that calls `buildTeamPageData` and renders values
- `src/pages/index.astro`
  - Team directory + client‑side search
- `src/pages/api/team/[slug].json.ts`
  - Static JSON endpoint mirroring page data (useful for debugging/clients)
- `scripts/generate-og-daily.mjs`
  - Builds dated OG images into `public/og` (dev) and `dist/og` (prod)
- `scripts/post-bluesky.mjs`
  - Posts a daily status per team (skips teams without credentials)

## Local development

Prereqs: Node 20+, pnpm 9+

- Install: `pnpm install`
- Dev: `pnpm dev` (predev generates OG images in `public/og`)
- Build: `pnpm build` (also generates OG images in `dist/og`)
- Preview: `pnpm preview`

Utilities:

- Lint: `pnpm lint` / `pnpm lint:fix`
- Format: `pnpm format` / `pnpm format:check`

## Contributing

- Centralize logic in `src/lib/mlb.mjs` instead of pages/scripts when possible.
- Keep `[team].astro` thin; if you find logic there, extract a helper.
- Surface new page data via `buildTeamPageData` for consistency.
- Use explicit, readable helper names; add JSDoc where helpful; avoid deep nesting.
- Run `pnpm lint` and ensure CI (Lint workflow) passes before opening a PR.

## Implementation notes

- Timezone‑aware date keys and formatting
  - We compute a team‑local date key for OG filenames and for “today” calculations.
- Schedule window
  - Controlled by `HORIZON_MONTHS = 9` in `src/lib/mlb.mjs`.
- TBD/placeholder game times
  - Many far‑future games have placeholder times (e.g., 03:33Z). We detect these and omit the time in copy.
- OG text wrapping
  - Only date/time fragments use non‑breaking spaces; regular words can wrap normally.
- Caching
  - `fetchScheduleWindowCached` avoids duplicate MLB requests within one run.

## Data

- Teams: `src/data/teams.json` with `id`, `name`, `slug`, `colors`, `venue`, `timezone`.

## Bluesky (for contributors)

- CI posts only when credentials exist; local manual test for a team:
```bash
BLUESKY_PASSWORD_CUBS=your-app-password pnpm post:bluesky
```
- Posts use `formatTeamStatus` and attach the daily OG if available.

## Static API (optional)

- `GET /api/team/[slug].json` returns the same data used to render pages.

## Project structure

```
src/
  data/teams.json        # MLB team ids, slugs, names, colors, venue
  lib/mlb.mjs            # MLB helpers (fetching, formatting, page builders)
  lib/seo.mjs            # JSON‑LD builder(s)
  pages/index.astro      # Team list with search
  pages/[team].astro     # Thin team page (SSG)
  pages/api/...          # Static JSON endpoint
  layouts/Layout.astro   # Base HTML layout and meta tags
  styles/global.css      # Global styles
scripts/
  generate-og-daily.mjs  # Renders OG images
  post-bluesky.mjs       # Optional daily posts
```

## Roadmap / multi‑sport readiness

- MLB helpers encapsulate league‑specific logic.
- To add another sport, mirror the MLB helper shapes (facts, status formatter, detail builder) and switch per‑sport.
