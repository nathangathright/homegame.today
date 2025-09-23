// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import icon from "astro-icon";

// https://astro.build/config
export default defineConfig({
  devToolbar: {
    enabled: false
  },
  integrations: [icon()],
  site: "https://homegame.today",
  vite: {
    plugins: [tailwindcss()],
  },
});
