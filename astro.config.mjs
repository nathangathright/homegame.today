// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import icon from "astro-icon";
import { readFileSync } from "node:fs";

const teams = JSON.parse(readFileSync("./src/data/teams.json", "utf-8"));
const teamSlugs = new Set(teams.map((/** @type {{ slug: string }} */ t) => t.slug));

// Fail build if any team slugs collide
if (teamSlugs.size !== teams.length) {
  const seen = new Map();
  for (const t of teams) {
    if (seen.has(t.slug)) {
      throw new Error(`Duplicate team slug "${t.slug}": ${seen.get(t.slug)} and ${t.name}`);
    }
    seen.set(t.slug, t.name);
  }
}

// https://astro.build/config
export default defineConfig({
  devToolbar: {
    enabled: false,
  },
  integrations: [
    icon(),
    sitemap({
      serialize(item) {
        const url = new URL(item.url);
        const slug = url.pathname.replace(/^\/|\/$/g, "");
        if (teamSlugs.has(slug)) {
          item.url = `https://${slug}.homegame.today/`;
        }
        return item;
      },
    }),
  ],
  site: "https://homegame.today",
  vite: {
    plugins: [tailwindcss()],
  },
});
