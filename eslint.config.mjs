import js from "@eslint/js";
import pluginAstro from "eslint-plugin-astro";
import tsParser from "@typescript-eslint/parser";
import globals from "globals";

export default [
  // Base globals for both Node and Web APIs (URL, fetch, Response, etc.)
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
  },
  js.configs.recommended,
  // Astro flat recommended config
  ...pluginAstro.configs["flat/recommended"],
  // TypeScript parsing for TS files used in scripts and API routes
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
    },
    rules: {},
  },
  // Loosen noisy rules inside Astro files (server/templating context)
  {
    files: ["**/*.astro"],
    rules: {
      "no-unused-vars": "off",
      "no-undef": "off",
    },
  },
  {
    ignores: ["dist/**", "node_modules/**", ".astro/**"],
  },
];


