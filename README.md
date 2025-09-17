# homegame.today

Find out if your MLB team has a home game today.

- **Live site**: `https://homegame.today`
- **Tech**: Astro 5, Tailwind CSS 4, TypeScript-enabled Astro components

## Features

- **Team directory** with search
- **Per-team pages** showing whether there is a home game today
- **Structured data (JSON‑LD)** for game pages
- **Static generation (SSG)** for GitHub Pages hosting
- **Daily rebuild** via GitHub Actions to keep results fresh

## Getting started

### Prerequisites

- Node.js 20+
- pnpm 9+

### Install

```bash
pnpm install
```

### Develop

```bash
pnpm dev
```

Visit `http://localhost:4321`.

### Build

```bash
pnpm build
```

### Preview (serve the built site locally)

```bash
pnpm preview
```

## Project structure

```
src/
  data/teams.json        # MLB team ids, slugs, names, colors, venue
  layouts/Layout.astro   # Base HTML layout, meta tags and theming
  pages/index.astro      # Team list with client-side search
  pages/[team].astro     # Static per-team page (SSG with getStaticPaths)
  styles/global.css      # Global styles
```

Key config:

- `astro.config.mjs` sets `site: "https://homegame.today"` for absolute URLs/canonicals.

## Data sources

- Schedules from the [MLB StatsAPI](https://statsapi.mlb.com/) (no key required)
- Team metadata from `src/data/teams.json`

## Deployment: GitHub Pages + custom domain

This repo is set up to deploy to GitHub Pages and rebuild daily.

1) Workflow

- See `.github/workflows/deploy.yml`.
- Triggers on pushes to `main`, manual runs, and a daily cron at 05:00 UTC.

2) Custom domain

- Add `public/CNAME` with:

```
homegame.today
```

- In GitHub → Settings → Pages, set the Custom domain to `homegame.today` and enable “Enforce HTTPS”.

3) DNS records (apex)

Point `homegame.today` A records to GitHub Pages:

```
185.199.108.153
185.199.109.153
185.199.110.153
185.199.111.153
```

Optional `www`:

- CNAME `www → <username>.github.io`

## Bluesky automated posts

- Each team uses its own Bluesky account with handle `@<slug>.homegame.today` (e.g., `@cubs.homegame.today`).
- Add a repo secret for each team you want to post for: `BLUESKY_PASSWORD_<SLUG>` (e.g., `BLUESKY_PASSWORD_CUBS`). Teams without a password secret are skipped.
- Posts run automatically on the daily scheduled workflow after the build. Manual runs and pushes do not post.
- Posts are plain text and include no links. Message examples:
  - "Chicago Cubs — Home game today at Wrigley Field."
  - "Chicago Cubs — No home game today."
  - "Chicago Cubs — No game today."
- Local test (example for Cubs):

```
BLUESKY_PASSWORD_CUBS=your-app-password pnpm post:bluesky
```


## How “daily updates” work

- Pages are statically generated; the per‑team route uses `getStaticPaths` and fetches the MLB schedule at build time.
- The GitHub Actions cron rebuilds the site once per day so the “today” result stays accurate.
- To change the rebuild time, edit the `cron` expression in `.github/workflows/deploy.yml`.

## Scripts

- `pnpm dev`: Start the dev server
- `pnpm build`: Build for production
- `pnpm preview`: Preview the production build
- `pnpm format`: Format with Prettier
- `pnpm format:check`: Check formatting

## Notes

- If you fork/rename or change the domain, update `site` in `astro.config.mjs` and the `public/CNAME` file.
- If you host somewhere other than GitHub Pages, remove or replace the Pages workflow and configure your host accordingly.
