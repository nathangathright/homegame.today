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

## Bluesky verified handles per team (subdomains)

Goal: allow handles like `cubs.homegame.today` for Bluesky, while redirecting web visits to `https://homegame.today/cubs` and serving `/.well-known/atproto-did` at the team subdomain for verification.

Serve each DID from the site and use a single Cloudflare Redirect Rule for subdomains.

1) Add DIDs to `src/data/teams.json`:

```json
{
  "id": 112,
  "name": "Chicago Cubs",
  "slug": "cubs",
  "colors": ["#0e3386", "#cc3433"],
  "venue": "Wrigley Field",
  "did": "did:plc:yourcubsdid"
}
```

2) Endpoint in repo: `src/pages/[team]/.well-known/atproto-did.ts` (included)

- It prerenders plain text `did` for teams that have a `did` value.
- URL: `https://homegame.today/<team>/.well-known/atproto-did`

3) Cloudflare DNS: wildcard CNAME

- Type: CNAME, Name: `*`, Target: `homegame.today`, Proxy: Proxied

4) Cloudflare Redirect Rule

When expression:

```
http.request.host.header ne "homegame.today" and ends_with(http.request.host.header, ".homegame.today")
```

Dynamic redirect URL:

```
concat("https://homegame.today/", regex_substring(http.request.host.header, "^[^.]+"), http.request.uri)
```

- This makes `https://cubs.homegame.today/.well-known/atproto-did` redirect to `https://homegame.today/cubs/.well-known/atproto-did` which serves the DID.

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
